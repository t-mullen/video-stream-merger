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