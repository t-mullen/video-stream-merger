/* globals window */

const CanvasBackend = require('./backends/video/canvas')
const WebAudioBackend = require('./backends/audio/webaudio')

module.exports = VideoStreamMerger

const defaultOpts = {
  width: 640,
  height: 480,
  fps: 25,
  clearRect: true
}

function VideoStreamMerger (opts = {}) {
  if (!(this instanceof VideoStreamMerger)) return new VideoStreamMerger(opts)

  opts = Object.assign({}, defaultOpts, opts)
  this.width = opts.width
  this.height = opts.height

  this._videoBackend = new CanvasBackend(opts)
  this._audioBackend = new WebAudioBackend(opts)

  this._streams = []
  this._frameCount = 0

  this.started = false
  this.result = null
}

VideoStreamMerger.prototype.setOutputSize = function (width, height) {
  this.width = width
  this.height = height
  this._videoBackend.setResolution(this.width, this.height)
}

VideoStreamMerger.prototype.updateIndex = function (mediaStream, index) {
  if (typeof mediaStream === 'string') {
    mediaStream = {
      id: mediaStream
    }
  }

  index = index == null ? 0 : index

  for (let i = 0; i < this._streams.length; i++) {
    if (mediaStream.id === this._streams[i].id) {
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
VideoStreamMerger.prototype.addMediaElement = function (id, element, opts = {}) {
  const stream = {}
  stream.x = opts.x || 0
  stream.y = opts.y || 0
  stream.width = opts.width == null ? this.width : opts.width
  stream.height = opts.height == null ? this.width : opts.width
  stream.mute = opts.mute || opts.muted || false

  const applyCustomDrawEffect = opts.draw
  const initCustomAudioEffect = opts.audioEffect

  if (element.tagName === 'VIDEO' || element.tagName === 'IMG') {
    stream.videoSource = this._videoBackend.createSourceFromElement(element)
    stream.applyDrawEffect = (videoCtx, _, done) => {
      if (applyCustomDrawEffect) {
        applyCustomDrawEffect(videoCtx, stream.videoSource, done)
      } else {
        // default draw function
        this._videoBackend.drawVideoSource(stream.videoSource, stream.x, stream.y, stream.width, stream.height)
        done()
      }
    }
  } else {
    stream.applyDrawEffect = null
  }

  if (!stream.mute) {
    const audioSource = this._audioBackend.createSourceFromElement(element)
    const audioSink = this._audioBackend.createSink(element)
    stream.audioSource = audioSource
    stream.audioSink = audioSink

    if (initCustomAudioEffect) {
      initCustomAudioEffect(audioSource, audioSink)
    } else {
      this._audioBackend.initDefaultAudioEffect(audioSource, audioSink)
    }
  }

  this.addStream(id, stream)
}

VideoStreamMerger.prototype.addStream = function (mediaStream, opts = {}) {
  if (typeof mediaStream === 'string') {
    return this._addData(mediaStream, opts)
  }

  const stream = {}
  stream.isData = false
  stream.x = opts.x || 0
  stream.y = opts.y || 0
  stream.width = opts.width == null ? this.width : opts.width
  stream.height = opts.height == null ? this.height : opts.height
  stream.mute = opts.mute || opts.muted || false
  stream.index = opts.index == null ? 0 : opts.index
  stream.hasVideo = mediaStream.getVideoTracks().length > 0

  const applyCustomDrawEffect = opts.draw
  const initCustomAudioEffect = opts.audioEffect

  // If it is the same MediaStream, we can reuse our video source
  let videoSource = null
  for (let i = 0; i < this._streams.length; i++) {
    if (this._streams[i].id === mediaStream.id) {
      videoSource = this._streams[i].videoSource
      videoSource.refCount++
    }
  }

  // initialize video video source, if none exists
  if (!videoSource) {
    videoSource = this._videoBackend.createSourceFromMediaStream(mediaStream)
    videoSource.refCount = 1
  }

  // audio
  if (!stream.mute) {
    const audioSource = this._audioBackend.createSourceFromMediaStream(mediaStream)
    const audioSink = this._audioBackend.createSink()
    stream.audioSource = audioSource
    stream.audioSink = audioSink

    if (initCustomAudioEffect) {
      initCustomAudioEffect(audioSource, audioSink)
    } else {
      this._audioBackend.initDefaultAudioEffect(audioSource, audioSink)
    }
  }

  // video
  stream.applyDrawEffect = (ctx, _, done) => {
    if (applyCustomDrawEffect) {
      applyCustomDrawEffect(ctx, videoSource, done)
    } else {
      // default draw function
      this._videoBackend.drawVideoSource(videoSource, stream.x, stream.y, stream.width, stream.height)
      done()
    }
  }

  stream.videoSource = videoSource
  stream.id = mediaStream.id || null
  this._streams.push(stream)
  this._zSortStreams()
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  const id = typeof mediaStream === 'string' ? mediaStream : mediaStream.id

  for (let i = 0; i < this._streams.length; i++) {
    const stream = this._streams[i]
    if (id === stream.id) {
      if (stream.videoSource) {
        videoSource.refCount--
        if (videoSource.refCount === 0) {
          this._videoBackend.destroyVideoSource(stream.videoSource)
        }
        stream.videoSource = null
      }

      if (stream.audioSource) {
        this._audioBackend.destroyAudioSource(stream.audioSource)
        stream.audioSource = null
      }
      if (stream.audioSink) {
        this._audioBackend.destroyAudioSink(stream.audioSink)
        stream.audioSink = null
      }

      if (stream.element) {
        stream.element.remove()
      }
      this._streams[i] = null
      this._streams.splice(i, 1)
      i--
    }
  }
}

VideoStreamMerger.prototype._addData = function (key, opts) {
  opts = opts || {}
  const stream = {}

  stream.isData = true
  stream.applyDrawEffect = opts.draw || null
  stream.id = key
  stream.element = null
  stream.index = opts.index == null ? 0 : opts.index

  if (opts.audioEffect) {
    stream.audioEffect = this._audioBackend.createAudioEffect(opts.audioEffect)
  }

  this._streams.push(stream)
  this._zSortStreams()
}

VideoStreamMerger.prototype.start = function () {
  this.started = true
  this._videoBackend.requestAnimationFrame(this._draw.bind(this))

  // Add video
  this.result = this._videoBackend.getOutputMediaStream()

  // Add audio
  const audioTracks = this._audioBackend.getAudioTracks()
  audioTracks.forEach(audioTrack => {
    this.result.addTrack(audioTrack)
  })
}

VideoStreamMerger.prototype._draw = function () {
  if (!this.started) return

  this._frameCount++

  // update video processing delay every 60 frames
  let t0 = null
  if (this._frameCount % 60 === 0) {
    t0 = window.performance.now()
  }

  let awaiting = this._streams.length
  const done = () => {
    awaiting--
    if (awaiting <= 0) {
      if (this._frameCount % 60 === 0) {
        const t1 = window.performance.now()
        this._audioBackend.updateAudioDelay(t1 - t0)
      }
      this._videoBackend.requestAnimationFrame(this._draw.bind(this))
    }
  }

  if (this.clearRect) {
    this._videoBackend.clear()
  }
  this._streams.forEach((stream) => {
    if (stream.applyDrawEffect) { // draw frames
      stream.applyDrawEffect(this._videoBackend.getContext(), stream.element, done)
    }
  })

  if (this._streams.length === 0) done()
}

VideoStreamMerger.prototype.destroy = function () {
  this.started = false

  this._videoBackend.destroy()
  this._audioBackend.destroy()

  this._streams.forEach(stream => {
    if (stream.element) {
      stream.element.remove()
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
  return this._videoBackend.getContext()
}

VideoStreamMerger.prototype.getAudioContext = function () {
  return this._audioCtx.getContext()
}

VideoStreamMerger.prototype.getAudioDestination = function () {
  return this._audioBackend.getAudioDestination()
}
