/* globals window */

module.exports = VideoStreamMerger

function VideoStreamMerger (opts) {
  var self = this
  if (!(self instanceof VideoStreamMerger)) return new VideoStreamMerger(opts)

  opts = opts || {}

  var AudioContext = window.AudioContext || window.webkitAudioContext
  var audioSupport = !!(AudioContext && (self._audioCtx = (opts.audioContext || new AudioContext())).createMediaStreamDestination)
  var canvasSupport = !!document.createElement('canvas').captureStream
  var supported = audioSupport && canvasSupport
  if (!supported) {
    throw new Error('Unsupported browser')
  }
  self.width = opts.width || 400
  self.height = opts.height || 300
  self.fps = opts.fps || 25

  // Hidden canvas element for merging
  self._canvas = document.createElement('canvas')
  self._canvas.setAttribute('width', self.width)
  self._canvas.setAttribute('height', self.height)
  self._canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none') // Push off screen
  self._ctx = self._canvas.getContext('2d')

  self._streams = []

  self._audioDestination = self._audioCtx.createMediaStreamDestination()

  self._setupConstantNode() // HACK for wowza #7, #10

  self.started = false
  self.result = null

  self._backgroundAudioHack()
}

VideoStreamMerger.prototype._backgroundAudioHack = function () {
  var self = thiss

  // stop browser from throttling timers by playing almost-silent audio
  var source = self._audioCtx.createConstantSource()
  var gainNode = ctx.createGain()
  gainNode.gain.value = 0.001 // required to prevent popping on start
  source.connect(gainNode)
  gainNode.connect(ctx.destination)
  source.start()
}

VideoStreamMerger.prototype._setupConstantNode = function () {
  var self = this

  var constantAudioNode = self._audioCtx.createConstantSource()
  constantAudioNode.start()

  var gain = self._audioCtx.createGain() // gain node prevents quality drop
  gain.gain.value = 0

  constantAudioNode.connect(gain)
  gain.connect(self._audioDestination)
}

VideoStreamMerger.prototype.updateIndex = function (mediaStream, index) {
  var self = this

  if (typeof mediaStream === 'string') {
    mediaStream = {
      id: mediaStream
    }
  }

  index = index == null ? self._streams.length : index

  for (var i = 0; i < self._streams.length; i++) {
    if (mediaStream.id === self._streams[i].id) {
      var stream = self._streams.splice(i, 1)[0]
      stream.index = index
      self._streams.splice(stream.index, 0, stream)
    }
  }
}

VideoStreamMerger.prototype.addStream = function (mediaStream, opts) {
  var self = this

  if (typeof mediaStream === 'string') {
    return self._addData(mediaStream, opts)
  }

  opts = opts || {}
  var stream = {}

  stream.isData = false
  stream.x = opts.x || 0
  stream.y = opts.y || 0
  stream.width = opts.width || self.width
  stream.height = opts.height || self.height
  stream.draw = opts.draw || null
  stream.mute = opts.mute || false
  stream.audioEffect = opts.audioEffect || null
  stream.index = opts.index == null ? self._streams.length : opts.index

  // If it is the same MediaStream, we can reuse our video element (and ignore sound)
  var videoElement = null
  for (var i = 0; i < self._streams.length; i++) {
    if (self._streams[i].id === mediaStream.id) {
      videoElement = self._streams[i].element
    }
  }

  if (!videoElement) {
    videoElement = document.createElement('video')
    videoElement.autoplay = true
    videoElement.muted = true
    videoElement.srcObject = mediaStream

    if (!stream.mute) {
      stream.audioSource = self._audioCtx.createMediaStreamSource(mediaStream)
      stream.audioOutput = self._audioCtx.createGain() // Intermediate gain node
      stream.audioOutput.gain.value = 1
      if (stream.audioEffect) {
        stream.audioEffect(stream.audioSource, stream.audioOutput)
      } else {
        stream.audioSource.connect(stream.audioOutput) // Default is direct connect
      }
      stream.audioOutput.connect(self._audioDestination)
    }
  }

  stream.element = videoElement
  stream.id = mediaStream.id || null
  self._streams.splice(stream.index, 0, stream)
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  var self = this

  if (typeof mediaStream === 'string') {
    mediaStream = {
      id: mediaStream
    }
  }

  for (var i = 0; i < self._streams.length; i++) {
    if (mediaStream.id === self._streams[i].id) {
      if (self._streams[i].audioSource) {
        self._streams[i].audioSource = null
      }
      if (self._streams[i].audioOutput) {
        self._streams[i].audioOutput.disconnect(self._audioDestination)
        self._streams[i].audioOutput = null
      }

      self._streams[i] = null
      self._streams.splice(i, 1)
      i--
    }
  }
}

VideoStreamMerger.prototype._addData = function (key, opts) {
  var self = this

  opts = opts || {}
  var stream = {}

  stream.isData = true
  stream.draw = opts.draw || null
  stream.audioEffect = opts.audioEffect || null
  stream.id = key
  stream.element = null
  stream.index = opts.index == null ? self._streams.length : opts.index

  if (stream.audioEffect) {
    stream.audioOutput = self._audioCtx.createGain() // Intermediate gain node
    stream.audioOutput.gain.value = 1
    stream.audioEffect(null, stream.audioOutput)
    stream.audioOutput.connect(self._audioDestination)
  }

  self._streams.splice(stream.index, 0, stream)
}

VideoStreamMerger.prototype.start = function () {
  var self = this

  self.started = true
  window.requestAnimationFrame(self._draw.bind(self))

  // Add video
  self.result = self._canvas.captureStream(self.fps)

  // Remove "dead" audio track
  var deadTrack = self.result.getAudioTracks()[0]
  if (deadTrack) self.result.removeTrack(deadTrack)

  // Add audio
  var audioTracks = self._audioDestination.stream.getAudioTracks()
  self.result.addTrack(audioTracks[0])
}

VideoStreamMerger.prototype._draw = function () {
  var self = this
  if (!self.started) return

  var awaiting = self._streams.length
  function done () {
    awaiting--
    if (awaiting <= 0) window.requestAnimationFrame(self._draw.bind(self))
  }

  self._ctx.clearRect(0, 0, self.width, self.height)
  self._streams.forEach(function (video) {
    if (video.draw) { // custom frame transform
      video.draw(self._ctx, video.element, done)
    } else if (!video.isData) {
      self._ctx.drawImage(video.element, video.x, video.y, video.width, video.height)
      done()
    } else {
      done()
    }
  })

  if (self._streams.length === 0) done()
}

VideoStreamMerger.prototype.destroy = function () {
  var self = this

  self.started = false

  self._canvas = null
  self._ctx = null
  self._streams = []
  self._audioCtx.close()
  self._audioCtx = null
  self._audioDestination = null

  self.result.getTracks().forEach(function (t) {
    t.stop()
  })
  self.result = null
}

module.exports = VideoStreamMerger
