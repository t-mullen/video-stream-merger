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

  this._videoImpl = opts.webgl ? new VideoImpl.WebGL(opts) : new VideoImpl.Canvas(opts)
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

VideoStreamMerger.prototype._zSortStreams = function () {
  this._streams = this._streams.sort((a, b) => {
    return a.index - b.index
  })
}

// convenience function for adding a media element
VideoStreamMerger.prototype.addMediaElement = function (element, opts = {}) {
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
    id: opts.id || null
  }

  // audio
  if (!stream.mute) {
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

  for (let i = 0; i < this._streams.length; i++) {
    const stream = this._streams[i]
    if (id === stream.id) {
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
    }
  }

  if (this._streams.length === 0) done()
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
