(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.VideoStreamMerger = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

function WebAudioImpl (opts) {
  if (!(this instanceof WebAudioImpl)) return new WebAudioImpl(opts)

  const AudioContext = window.AudioContext || window.webkitAudioContext
  const audioSupport = !!(AudioContext && (this._audioCtx = (opts.audioContext || new AudioContext())).createMediaStreamDestination)
  if (!audioSupport) {
    throw new Error('audio implementation "webaudio" is not supported in this browser')
  }

  this._audioDestination = this._audioCtx.createMediaStreamDestination()

  // delay node for video sync
  this._videoSyncDelayNode = this._audioCtx.createDelay(5.0)
  this._videoSyncDelayNode.connect(this._audioDestination)
  this._nodeReferences = new Set()

  this._setupConstantNode() // HACK for wowza #7, #10
  this._backgroundAudioHack()
}

WebAudioImpl.prototype.destroyAudioSource = function (audioSink) {
  // nothing to do
}

WebAudioImpl.prototype.destroyAudioSink = function (audioSink) {
  audioSink.disconnect(this._videoSyncDelayNode)
}

WebAudioImpl.prototype.getAudioDestination = function () {
  return this._audioDestination
}

WebAudioImpl.prototype._backgroundAudioHack = function () {
  // stop browser from throttling timers by playing almost-silent audio
  const source = this._audioCtx.createConstantSource()
  const gainNode = this._audioCtx.createGain()
  gainNode.gain.value = 0.001 // required to prevent popping on start
  source.connect(gainNode)
  gainNode.connect(this._audioCtx.destination)
  source.start()
}

WebAudioImpl.prototype._setupConstantNode = function () {
  const constantAudioNode = this._audioCtx.createConstantSource()
  constantAudioNode.start()

  const gain = this._audioCtx.createGain() // gain node prevents quality drop
  gain.gain.value = 0

  constantAudioNode.connect(gain)
  gain.connect(this._videoSyncDelayNode)
}

WebAudioImpl.prototype.initAudioEffect = function (sourceNode, destinationNode, customEffectFunction) {
  if (customEffectFunction) {
    customEffectFunction(sourceNode, this._videoSyncDelayNode)
    return {}
  } else {
    sourceNode.connect(this._videoSyncDelayNode)
    return {}
  }
}

WebAudioImpl.prototype.updateAudioDelay = function (delayInMs) {
  this._videoSyncDelayNode.delayTime.setValueAtTime(delayInMs / 1000, this._audioCtx.currentTime)
}

WebAudioImpl.prototype.createSourceFromElement = function (element) {
  const sourceNode = element._VSMSourceNode || this._audioCtx.createMediaElementSource(element)
  sourceNode.origin = 'element'
  sourceNode.connect(this._audioCtx.destination) // continue to allow element's audio in global audio context

  // gain node to allow muted element audio to be captured while virtually silent
  const gainNode = this._audioCtx.createGain()
  sourceNode.connect(gainNode)
  if (element.muted) {
    // keep the element "muted" while having audio on the merger
    element.muted = false
    element.volume = 0.001
    gainNode.gain.value = 1000
  } else {
    gainNode.gain.value = 1
  }

  // tie lifetime to element
  element._VSMSourceNode = sourceNode // only one source per element
  element._VSMGainNodes = element._VSMGainNodes || []
  element._VSMGainNodes.push(gainNode)

  return gainNode
}

WebAudioImpl.prototype.createSourceFromMediaStream = function (mediaStream) {
  const sourceNode = this._audioCtx.createMediaStreamSource(mediaStream)

  // tie lifetime to mediastream
  mediaStream._VSMSourceNode = sourceNode

  return sourceNode
}

WebAudioImpl.prototype.createSink = function () {
  const gainNode = this._audioCtx.createGain() // Intermediate gain node
  gainNode.gain.value = 1
  gainNode.connect(this._videoSyncDelayNode)
  this._nodeReferences.add(gainNode)
  return gainNode
}

WebAudioImpl.prototype.getContext = function () {
  return this._audioCtx
}

WebAudioImpl.prototype.getAudioTracks = function () {
  return this._audioDestination.stream.getAudioTracks()
}

WebAudioImpl.prototype.destroy = function () {
  this._audioCtx.close()
  this._audioCtx = null
  this._audioDestination = null
  this._videoSyncDelayNode = null
}

module.exports = WebAudioImpl
},{}],2:[function(require,module,exports){
/* global document, window */

function CanvasImpl(opts) {
  if (!(this instanceof CanvasImpl)) return new CanvasImpl(opts)

  const captureSupport = !!document.createElement('canvas').captureStream
  if (!captureSupport) {
    throw new Error('"CanvasElement.captureStream" is not supported in this browser')
  }

  this.width = opts.width
  this.height = opts.height
  this.fps = opts.fps

  // Hidden canvas element for merging
  this._canvas = document.createElement('canvas')
  this._canvas.setAttribute('width', this.width)
  this._canvas.setAttribute('height', this.height)
  this._canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none') // Push off screen
  this._ctx = this._canvas.getContext('2d')
}

CanvasImpl.prototype.createSourceFromElement = function (videoElement) {
  return { videoElement, isExternalElement: true }
}

CanvasImpl.prototype.createSourceFromMediaStream = function (mediaStream) {
  if (mediaStream._VSMVideoElement) {
    mediaStream._VSMVideoElement.refCount++
    return { videoElement: mediaStream._VSMVideoElement }
  }

  const videoElement = document.createElement('video')
  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.srcObject = mediaStream
  videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; pointer-events: none; opacity:0;')
  videoElement.refCount = 1
  document.body.appendChild(videoElement)
  mediaStream._VSMVideoElement = videoElement

  return { videoElement, isExternalElement: false }
}

CanvasImpl.prototype.setResolution = function (width, height) {
  this.width = width
  this.height = height
  this._canvas.setAttribute('width', width)
  this._canvas.setAttribute('height', height)
}

CanvasImpl.prototype.getContext = function () {
  return this._ctx
}

CanvasImpl.prototype.clear = function () {
  this._ctx.clearRect(0, 0, this.width, this.height)
}

CanvasImpl.prototype.setVideoCoords = function (videoSource, x, y, width, height) {
  videoSource._VSMCoords = { x, y, width, height }
}

CanvasImpl.prototype.initDrawEffect = function (customDrawEffect) {
  if (customDrawEffect) {
    return (ctx, videoSource, done) => {
      customDrawEffect(ctx, videoSource.videoElement, done)
    }
  } else {
    return (ctx, videoSource, done) => {
      ctx.drawImage(videoSource.videoElement, videoSource._VSMCoords.x, videoSource._VSMCoords.y, videoSource._VSMCoords.width, videoSource._VSMCoords.height)
      done()
    }
  }
}

CanvasImpl.prototype.getOutputMediaStream = function () {
  const mediaStream = this._canvas.captureStream(this.fps)

  // Remove "dead" audio tracks
  mediaStream.getAudioTracks().forEach(deadTrack => {
    mediaStream.removeTrack(deadTrack)
  })

  return mediaStream
}

CanvasImpl.prototype.destroyVideoSource = function (videoSource) {
  if (videoSource.isExternalElement) return
  videoSource.videoElement.refCount--
  if (videoSource.videoElement.refCount === 0) {
    videoSource.videoElement.remove()
  }
}

CanvasImpl.prototype.destroy = function () {
  this._canvas = null
  this._ctx = null
}

module.exports = CanvasImpl
},{}],3:[function(require,module,exports){
/* global document, window */

function buildVertexShader () {
  return `#version 300 es
  in vec4 a_position;
  in vec2 a_texCoord;
  in int a_texUnit;
   
  out vec2 v_texCoord;
  flat out int v_texUnit;
   
  void main() {
    gl_Position = a_position;
    v_texCoord = a_texCoord;
    v_texUnit = a_texUnit;
  }`
}

function buildFragShader (maxTextureUnits) {
  return `#version 300 es
  precision mediump float;
   
  in vec2 v_texCoord;
  flat in int v_texUnit;
  
  out vec4 outColor;
  ` +
  (new Array(maxTextureUnits)).fill(null).map((_, i) => 
  `uniform sampler2D u_texture` + i + `;`
  ).join('\n') +
  `
  
  void main() {
  ` +
    (new Array(maxTextureUnits)).fill(null).map((_, i) => 
      `if (v_texUnit == ` + i + `)
        outColor = texture(u_texture` + i + `, v_texCoord);`
    ).join('\n') +
  `}`
}

const defaultOpts = {
  maxTextureUnits: 16,
}

function WebGLImpl(opts) {
  if (!(this instanceof WebGLImpl)) return new WebGLImpl(opts)

  opts = Object.assign({}, defaultOpts, opts)

  const captureSupport = !!document.createElement('canvas').captureStream
  if (!captureSupport) {
    throw new Error('"CanvasElement.captureStream" is not supported in this browser')
  }

  this.width = opts.width
  this.height = opts.height
  this.fps = opts.fps

  // Hidden canvas element for merging
  this._canvas = document.createElement('canvas')
  this._canvas.setAttribute('width', this.width)
  this._canvas.setAttribute('height', this.height)
  this._canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none') // Push off screen
  
  const gl = this._ctx = this._canvas.getContext('webgl2', {
    antialias: false,
    depth: false,
    stencil: false
  })
  if (this._ctx === null) {
    throw new Error('Unable to initialize WebGL. Your browser or device may not support it.')
  }

  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, buildVertexShader())
  gl.compileShader(vs)

  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  this._maxTextureUnits = Math.min(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS, opts.maxTextureUnits)
  gl.shaderSource(fs, buildFragShader(this._maxTextureUnits))
  gl.compileShader(fs)

  const program = this._program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
    console.log(gl.getShaderInfoLog(vs))

  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
    console.log(gl.getShaderInfoLog(fs))

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.log(gl.getProgramInfoLog(program))
  
  gl.useProgram(program)

  // create buffers
  const positionBuffer = this._positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  const aPositionLocation = gl.getAttribLocation(this._program, 'a_position')
  gl.enableVertexAttribArray(aPositionLocation)
  gl.vertexAttribPointer(aPositionLocation, 2, gl.FLOAT, false, 0, 0)

  const textureCoordBuffer = this._textureCoordBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer)
  const aTextureCoordLocation = gl.getAttribLocation(this._program, 'a_texCoord')
  gl.enableVertexAttribArray(aTextureCoordLocation)
  gl.vertexAttribPointer(aTextureCoordLocation, 2, gl.FLOAT, false, 0, 0)

  const textureUnitBuffer = this._textureUnitBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, textureUnitBuffer)
  const aTextureUnitLocation = gl.getAttribLocation(this._program, 'a_texUnit')
  gl.enableVertexAttribArray(aTextureUnitLocation)
  gl.vertexAttribIPointer(aTextureUnitLocation, 1, gl.INT, false, 0, 0)

  this._doneDrawing = 0
  this._entries = 0
  this._positionArr = []
  this._textureCoordArr = []
  this._textureUnitArr = []
  this._freeTextureUnits = (new Array(this._maxTextureUnits)).fill(0).map((_, i) => i)

  this._cachedTextureInfo = new WeakMap() // maps VideoElement to unique Texture, TextureUnit
  this._videoSources = new Set()
}

WebGLImpl.prototype._deleteBufferEntry = function (videoSource) {
  const gl = this._ctx
  this._positionArr.splice(videoSource.bufferOffset * 12, 12)
  gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._positionArr), gl.STATIC_DRAW)

  this._textureCoordArr.splice(videoSource.bufferOffset * 12, 12)
  gl.bindBuffer(gl.ARRAY_BUFFER, this._textureCoordBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._textureCoordArr), gl.STATIC_DRAW)

  this._textureUnitArr.splice(videoSource.bufferOffset * 6, 6)
  gl.bindBuffer(gl.ARRAY_BUFFER, this._textureUnitBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Int32Array(this._textureUnitArr), gl.STATIC_DRAW)

  this._entries--
}

WebGLImpl.prototype._createBufferEntry = function (textureUnit) {
  const gl = this._ctx
  this._positionArr = this._positionArr.concat((new Array(12)).fill(0))
  gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._positionArr), gl.STATIC_DRAW)

  this._textureCoordArr = this._textureCoordArr.concat([
    0, 1,
    0, 0,
    1, 1,
    1, 1,
    0, 0,
    1, 0
  ])
  gl.bindBuffer(gl.ARRAY_BUFFER, this._textureCoordBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._textureCoordArr), gl.STATIC_DRAW)

  this._textureUnitArr = this._textureUnitArr.concat([
    textureUnit,
    textureUnit,
    textureUnit,
    textureUnit,
    textureUnit,
    textureUnit
  ])
  gl.bindBuffer(gl.ARRAY_BUFFER, this._textureUnitBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Int32Array(this._textureUnitArr), gl.STATIC_DRAW)

  return this._entries++
}

WebGLImpl.prototype.createSourceFromElement = function (videoElement) {
  videoElement._VSMExternalElement = true
  videoElement._VSMRefCount = videoElement._VSMRefCount || 0
  videoElement._VSMRefCount++
  return this._createSourceFromElement(videoElement)
}

WebGLImpl.prototype._createSourceFromElement = function (videoElement) {
  // reuse textures+texture units for the same element added multiple times
  const cachedTextureInfo = this._cachedTextureInfo.get(videoElement)
  const textureUnit = cachedTextureInfo ? cachedTextureInfo.textureUnit : this._freeTextureUnits.shift()
  if (textureUnit == null) {
    throw new Error('Exceeded maximum number of texture units : ' + this._maxTextureUnits)
  }
  const videoSource = {
    readyToCopy: false,
    videoElement,
    textureInfo: cachedTextureInfo || this._createTextureInfo(textureUnit),
    bufferOffset: this._createBufferEntry(textureUnit),
    x: 0, y: 0, w: 0, h: 0
  }
  this._videoSources.add(videoSource)
  this._cachedTextureInfo.set(videoElement, videoSource.textureInfo)

  let playing = false
  let timeupdate = false
  let timeUpdateInterval

  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.loop = true

  const checkReady = () => {
    if (playing && timeupdate) {
      videoSource.readyToCopy = true
      videoElement.removeEventListener('playing', onPlaying)
      clearInterval(timeUpdateInterval)
    }
  }

  const onPlaying = () => {
    playing = true
    checkReady()
  }
  const onTimeUpdate = () => {
    if (videoElement.currentTime > 0) {
      timeupdate = true
      checkReady()
    }
  }

  videoElement.addEventListener('playing', onPlaying, true)
  setInterval(onTimeUpdate, 100)

  return videoSource
}

WebGLImpl.prototype.setVideoCoords = function (videoSource, x, y, w, h) {
  videoSource.x = x
  videoSource.y = y
  videoSource.w = w
  videoSource.h = h

  this._updateBuffer(videoSource)
}

WebGLImpl.prototype._updateBuffer = function ({ bufferOffset, x, y, w, h }) {
  const gl = this._ctx

  y = this.height - (y + h)
  const pix2Clip = (x, full) => { return 2.0 * (x / full) - 1.0 }
  const vertices = new Float32Array([
    // Triangle 1
    pix2Clip(x, this.width), pix2Clip(y, this.height),
    pix2Clip(x, this.width), pix2Clip(y + h, this.height),
    pix2Clip(x + w, this.width), pix2Clip(y, this.height),

    // Triangle 2
    pix2Clip(x + w, this.width), pix2Clip(y, this.height),
    pix2Clip(x, this.width), pix2Clip(y + h, this.height),
    pix2Clip(x + w, this.width), pix2Clip(y + h, this.height),
  ])
  for (let i = 0; i < vertices.length; ++i) {
    this._positionArr[i + bufferOffset * 12] = vertices[i]
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer)
  // gl.bufferSubData(gl.ARRAY_BUFFER, videoSource.bufferOffset, vertices, 0, 12)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._positionArr), gl.STATIC_DRAW)
}

WebGLImpl.prototype._createTextureInfo = function (textureUnit) {
  const gl = this._ctx
  const texture = gl.createTexture()
  
  gl.activeTexture(gl.TEXTURE0 + textureUnit)
  gl.bindTexture(gl.TEXTURE_2D, texture)

  const samplerUniform = gl.getUniformLocation(this._program, 'u_texture' + textureUnit)
  gl.uniform1i(samplerUniform, textureUnit)

  // initialize with single transparent pixel
  const level = 0
  const internalFormat = gl.RGB
  const width = 1
  const height = 1
  const border = 0
  const srcFormat = gl.RGB
  const srcType = gl.UNSIGNED_BYTE
  const pixel = new Uint8Array([0, 0, 0, 0])
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                width, height, border, srcFormat, srcType,
                pixel)

  // Turn off mips and set wrapping to clamp to edge so it
  // will work regardless of the dimensions of the video.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

  return {
    texture,
    textureUnit,
    refCount: 1
  }
}

WebGLImpl.prototype._updateTexture = function (videoSource) {
  if (!videoSource.readyToCopy) return

  const gl = this._ctx
  const level = 0
  const internalFormat = gl.RGBA
  const srcFormat = gl.RGBA
  const srcType = gl.UNSIGNED_BYTE

  gl.activeTexture(gl.TEXTURE0 + videoSource.textureInfo.textureUnit)
  gl.bindTexture(gl.TEXTURE_2D, videoSource.textureInfo.texture)
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                srcFormat, srcType, videoSource.videoElement)
}

WebGLImpl.prototype.createSourceFromMediaStream = function (mediaStream) {
  // reuse 1 video element for mediastream added multiple times
  const cachedElement = mediaStream._VSMVideoElement
  if (cachedElement) {
    cachedElement._VSMRefCount++
    return this._createSourceFromElement(cachedElement)
  }

  const videoElement = document.createElement('video')
  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.srcObject = mediaStream
  videoElement.preload = 'auto'
  videoElement.autoload = true
  videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; width: 0px; height: 0px; pointer-events: none; opacity:0;')
  document.body.appendChild(videoElement)

  videoElement._VSMExternalElement = false
  videoElement._VSMRefCount = 1
  mediaStream._VSMVideoElement = videoElement

  return this._createSourceFromElement(videoElement)
}

WebGLImpl.prototype.setResolution = function (width, height) {
  const gl = this._ctx
  this.width = width
  this.height = height
  this._canvas.setAttribute('width', width)
  this._canvas.setAttribute('height', height)
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  for (const videoSource of this._videoSources) {
    this._updateBuffer(videoSource)
  }
}

WebGLImpl.prototype.getContext = function () {
  return this._ctx
}

WebGLImpl.prototype.clear = function () {
  this._ctx.clearColor(0.0, 0.0, 0.0, 1.0)
  this._ctx.clear(gl.COLOR_BUFFER_BIT)
}

WebGLImpl.prototype.initDrawEffect = function (customDrawEffect) {
  const gl = this._ctx
  if (customDrawEffect) {
    // TODO: support draw effects
    throw new Error('WebGL does not support custom draw effects yet.')
  } else {
    return (_, videoSource, done) => {
      this._updateTexture(videoSource)
      this._doneDrawing++
      if (this._doneDrawing === this._entries) {
        this._doneDrawing = 0
        gl.drawArrays(gl.TRIANGLES, 0, this._entries * 6)
      }
      done()
    }
  }
}

WebGLImpl.prototype.getOutputMediaStream = function () {
  const mediaStream = this._canvas.captureStream(this.fps)

  // Remove "dead" audio tracks
  mediaStream.getAudioTracks().forEach(deadTrack => {
    mediaStream.removeTrack(deadTrack)
  })

  return mediaStream
}

WebGLImpl.prototype.destroyVideoSource = function (videoSource) {
  videoSource.videoElement._VSMRefCount--
  if (videoSource.videoElement._VSMRefCount === 0) {
    if (!videoSource._VSMExternalElement) {
      videoSource.videoElement.remove()
    }

    this._freeTextureUnits.push(videoSource.textureInfo.textureUnit)
    this._freeTextureUnits.sort((a, b) => a - b)
  }

  this._deleteBufferEntry(videoSource)
  this._videoSources.delete(videoSource)

  const removedOffset = videoSource.bufferOffset
  for (let vs of this._videoSources) {
    if (vs.bufferOffset > removedOffset) {
      vs.bufferOffset--
    }
  }
}

WebGLImpl.prototype.destroy = function () {
  this._canvas = null
  this._ctx = null
}

module.exports = WebGLImpl
},{}],4:[function(require,module,exports){
/* globals window */

module.exports = VideoStreamMerger
const VideoImpl = {
  Canvas: require('./impl/video/canvas'),
  WebGL: require('./impl/video/webgl')
}
const AudioImpl = {
  WebAudio: require('./impl/audio/webaudio')
}

const defaultOpts = {
  width: 640,
  height: 480,
  fps: 30,
  clearRect: false,
  webgl: false
}
const FPS_BENCHMARK = false

function VideoStreamMerger (opts = {}) {
  if (!(this instanceof VideoStreamMerger)) return new VideoStreamMerger(opts)

  opts = Object.assign({}, defaultOpts, opts)
  this.width = opts.width
  this.height = opts.height
  this.fps = opts.fps

  const webglSupport = !!window.WebGLRenderingContext
  this._videoImpl = (opts.webgl && webglSupport)? new VideoImpl.WebGL(opts) : new VideoImpl.Canvas(opts)
  this._audioImpl = new AudioImpl.WebAudio(opts)

  this._streams = []
  this._frameInterval = null
  this._frameIntervalCallback = null
  this._frameCount = 0
  this._frameT0 = null
  this._drawT0 = null
  this._throttleInterval = (1000 / (this.fps * 1.3)) // throttle at 2x FPS
  this._awaitingDraw = 0
  this._onFrameBound = this._onFrame.bind(this)
  this._onDoneDrawBound = this._onDoneDraw.bind(this)

  this.started = false
  this.result = null
  this.benchmarkFPS = null
}

VideoStreamMerger.prototype.setOutputSize = function (width, height) {
  this.width = width
  this.height = height
  this._videoImpl.setResolution(this.width, this.height)
}

VideoStreamMerger.prototype.updateIndex = function (mediaStream, index) {
  const id = typeof mediaStream === 'string' ? mediaStream : mediaStream.id
  index = index == null ? 0 : index

  for (let i = 0; i < this._streams.length; i++) {
    if (id === this._streams[i].id) {
      this._streams[i].index = index
    }
  }
  this._zSortStreams()
}

VideoStreamMerger.prototype.updatePosition = function (mediaStream, x, y, width, height) {
  const id = typeof mediaStream === 'string' ? mediaStream : mediaStream.id

  for (let i = 0; i < this._streams.length; i++) {
    if (id === this._streams[i].id) {
      const stream = this._streams[i]
      stream.x = x
      stream.y = y
      stream.width = width
      stream.height = height
      this._videoImpl.setVideoCoords(stream.videoSource, stream.x, stream.y, stream.width, stream.height)
    }
  }
  this._zSortStreams()
}

VideoStreamMerger.prototype._zSortStreams = function () {
  this._streams = this._streams.sort((a, b) => {
    return a.index - b.index
  })
}

// convenience function for adding a media element
VideoStreamMerger.prototype.addMediaElement = function (id, element, opts = {}) {
  const stream = {
    x: opts.x || 0,
    y: opts.y || 0,
    width: opts.width == null ? this.width : opts.width,
    height: opts.height == null ? this.height : opts.height,
    mute: opts.mute || opts.muted || false,
    index: opts.index == null ? 0 : opts.index,
    audioSource: null,
    audioSink: null,
    audioEffect: null,
    videoSource: null,
    id: id || opts.id || null
  }

  // audio
  if (!stream.mute && (element.tagName === 'VIDEO' || element.tagName === 'AUDIO')) {
    const audioSource = stream.audioSource = this._audioImpl.createSourceFromElement(element)
    const audioSink = stream.audioSink = this._audioImpl.createSink(element)
    stream.audioEffect = this._audioImpl.initAudioEffect(audioSource, audioSink, opts.audioEffect)
  }

  // video
  if (element.tagName === 'VIDEO' || element.tagName === 'IMG') {
    stream.videoSource = this._videoImpl.createSourceFromElement(element)
    this._videoImpl.setVideoCoords(stream.videoSource, stream.x, stream.y, stream.width, stream.height)
    stream.applyDrawEffect = this._videoImpl.initDrawEffect(opts.draw)
  } else {
    stream.applyDrawEffect = null
  }

  this._streams.push(stream)
  this._zSortStreams()
}

VideoStreamMerger.prototype.addStream = function (mediaStream, opts = {}) {
  if (typeof mediaStream === 'string') {
    opts.id = mediaStream // support older ID argument API
    mediaStream = null
  }
  const stream = {
    x: opts.x || 0,
    y: opts.y || 0,
    width: opts.width == null ? this.width : opts.width,
    height: opts.height == null ? this.height : opts.height,
    mute: opts.mute || opts.muted || false,
    index: opts.index == null ? 0 : opts.index,
    audioSource: null,
    audioSink: null,
    audioEffect: null,
    videoSource: null,
    id: opts.id || mediaStream.id || null
  }

  // audio
  if (!stream.mute) {
    if (mediaStream) {
      const audioSource = stream.audioSource = this._audioImpl.createSourceFromMediaStream(mediaStream)
      const audioSink = stream.audioSink = this._audioImpl.createSink()
      stream.audioEffect = this._audioImpl.initAudioEffect(audioSource, audioSink, opts.audioEffect)
    } else {
      stream.audioEffect = this._audioImpl.initAudioEffect(null, null, opts.audioEffect)
    }
  }

  // video
  if (mediaStream) {
    stream.videoSource = this._videoImpl.createSourceFromMediaStream(mediaStream)
    this._videoImpl.setVideoCoords(stream.videoSource, stream.x, stream.y, stream.width, stream.height)
    stream.applyDrawEffect = this._videoImpl.initDrawEffect(opts.draw) 
  } else {
    stream.applyDrawEffect = this._videoImpl.initDrawEffect(opts.draw)
  }

  this._streams.push(stream)
  this._zSortStreams()
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  const id = typeof mediaStream === 'string' ? mediaStream : mediaStream.id
  let found = false

  for (let i = 0; i < this._streams.length; i++) {
    const stream = this._streams[i]
    if (id === stream.id) {
      found = true
      if (stream.videoSource) {
        this._videoImpl.destroyVideoSource(stream.videoSource)
        stream.videoSource = null
      }
      if (stream.audioSource) {
        this._audioImpl.destroyAudioSource(stream.audioSource)
        stream.audioSource = null
      }
      if (stream.audioSink) {
        this._audioImpl.destroyAudioSink(stream.audioSink)
        stream.audioSink = null
      }
      this._streams[i] = null
      this._streams.splice(i, 1)
      i--
    }
  }

  if (!found) {
    throw new Error('No stream with ID : ' + id)
  }
}

VideoStreamMerger.prototype.start = function () {
  this.started = true

  // interval fallback
  this._frameInterval = setInterval(() => {
    if (this._frameIntervalCallback) {
      const timestamp = performance.now()
      this._frameIntervalCallback(timestamp)
    }
  }, 1000 / this.fps)

  this._requestAnimationFrame()

  // for benchmarking
  if (FPS_BENCHMARK) {
    setInterval(() => {
      const timestamp = window.performance.now()
      this.benchmarkFPS = 1000 / (timestamp - this._frameT0)
      this._frameT0 = timestamp
      this._draw()
    }, 0)
  }

  // Add video
  this.result = this._videoImpl.getOutputMediaStream()

  // Add audio
  const audioTracks = this._audioImpl.getAudioTracks()
  audioTracks.forEach(audioTrack => {
    this.result.addTrack(audioTrack)
  })
}

VideoStreamMerger.prototype._onFrame = function (timestamp) {
  if (!this._frameFired && (this._frameT0 === null || timestamp - this._frameT0 > this._throttleInterval)) {
    this._frameIntervalCallback = null
    this._frameFired = true
    if (this._frameT0 !== null) {
      this.benchmarkFPS = 1000 / (timestamp - this._frameT0)
    }
    this._frameT0 = timestamp
    this._draw()
  } else {
    requestAnimationFrame(this._onFrameBound)
  }
}

// Wrapper around requestAnimationFrame and setInterval to avoid background throttling
VideoStreamMerger.prototype._requestAnimationFrame = function () {
  if (FPS_BENCHMARK) return

  this._frameFired = false
  
  this._frameIntervalCallback = this._onFrameBound
  requestAnimationFrame(this._onFrameBound)
}

VideoStreamMerger.prototype._onDoneDraw = function () {
  this._awaitingDraw--
  if (this._awaitingDraw <= 0) {
    if (this._frameCount % 60 === 0) {
      const drawT1 = window.performance.now()
      this._audioImpl.updateAudioDelay(drawT1 - this._drawT0)
    }
    this._requestAnimationFrame()
  }
}

VideoStreamMerger.prototype._draw = function () {
  if (!this.started) return

  this._frameCount++

  // update video processing delay every 60 frames
  if (this._frameCount % 60 === 0) {
    this._drawT0 = window.performance.now()
  }

  if (this.clearRect) {
    this._videoImpl.clear()
  }

  this._awaitingDraw = this._streams.length
  for (let i = 0; i < this._streams.length; ++i) {
    const stream = this._streams[i]
    if (stream.applyDrawEffect) { // draw frames
      stream.applyDrawEffect(this._videoImpl.getContext(), stream.videoSource, this._onDoneDrawBound)
    } else {
      this._onDoneDrawBound()
    }
  }

  if (this._streams.length === 0) this._onDoneDrawBound()
}

VideoStreamMerger.prototype.destroy = function () {
  this.started = false

  clearInterval(this._frameInterval)
  this._frameIntervalCallback = null

  this._videoImpl.destroy()
  this._audioImpl.destroy()

  this._streams.forEach(stream => {
    if (stream.videoSource) {
      this._videoImpl.destroyVideoSource(stream.videoSource)
    }
  })
  this._streams = []

  this.result.getTracks().forEach((t) => {
    t.stop()
  })

  this.result = null
}

// legacy methods

VideoStreamMerger.prototype.getCanvasContext = function () {
  return this._videoImpl.getContext()
}

VideoStreamMerger.prototype.getAudioContext = function () {
  return this._audioCtx.getContext()
}

VideoStreamMerger.prototype.getAudioDestination = function () {
  return this._audioImpl.getAudioDestination()
}

},{"./impl/audio/webaudio":1,"./impl/video/canvas":2,"./impl/video/webgl":3}]},{},[4])(4)
});
