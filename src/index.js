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

  self._videos = []

  self._audioDestination = self._audioCtx.createMediaStreamDestination()

  self.started = false
  self.result = null
}

VideoStreamMerger.prototype.addStream = function (mediaStream, opts) {
  var self = this

  opts = opts || {}

  opts.x = opts.x || 0
  opts.y = opts.y || 0
  opts.width = opts.width || self.width
  opts.height = opts.height || self.height
  opts.draw = opts.draw || null
  opts.mute = opts.mute || false

  // If it is the same MediaStream, we can reuse our video element (and ignore sound)
  var video = null
  for (var i = 0; i < self._videos.length; i++) {
    if (self._videos[i].id === mediaStream.id) {
      video = self._videos[i].element
    }
  }

  if (!video) {
    video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.srcObject = mediaStream

    if (!opts.mute) {
      opts.audioSource = self._audioCtx.createMediaStreamSource(mediaStream)
      if (opts.audioEffect) {
        opts.audioEffect(opts.audioSource, self._audioDestination)
      } else {
        opts.audioSource.connect(self._audioDestination)
      }
    }
  }

  opts.element = video
  opts.id = mediaStream.id || null
  self._videos.push(opts)
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  var self = this

  for (var i = 0; i < self._videos.length; i++) {
    if (mediaStream.id === self._videos[i].id) {
      if (self._videos[i].audioSource) {
        self._videos[i].audioSource.disconnect(self._audioDestination)
        self._videos[i].audioSource = null
      }

      self._videos[i] = null
      self._videos.splice(i, 1)
      i--
    }
  }
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

  var awaiting = self._videos.length
  function done () {
    awaiting--
    if (awaiting <= 0) window.requestAnimationFrame(self._draw.bind(self))
  }

  self._ctx.clearRect(0, 0, self.width, self.height)
  self._videos.forEach(function (video) {
    if (video.draw) { // custom frame transform
      video.draw(self._ctx, video.element, done)
    } else {
      self._ctx.drawImage(video.element, video.x, video.y, video.width, video.height)
      done()
    }
  })

  if (self._videos.length === 0) done()
}

VideoStreamMerger.prototype.destroy = function () {
  var self = this

  self.started = false

  self._canvas = null
  self._ctx = null
  self._videos = []
  self._audioCtx = null
  self._audioDestination = null

  self.result.getTracks().forEach(function (t) {
    t.stop()
  })
  self.result = null
}

module.exports = VideoStreamMerger
