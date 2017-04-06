
module.exports = VideoStreamMerger

function VideoStreamMerger (opts) {
  var self = this
  if (!(self instanceof VideoStreamMerger)) return new VideoStreamMerger(opts)

  opts = opts || {}
  self.width = opts.width || 400
  self.height = opts.height || 300
  self.fps = opts.fps || 25

  // Hidden canvas element for merging
  self._canvas = document.createElement('canvas')
  self._canvas.setAttribute('width', self.width)
  self._canvas.setAttribute('height', self.height)
  self._canvas.setAttribute('style', 'position:fixed; right: -10px') // Push off screen
  document.body.appendChild(self._canvas)
  self._ctx = self._canvas.getContext('2d')

  // Hidden div to contain video elements
  self._container = document.createElement('div')
  self._container.setAttribute('style', 'display:none')
  document.body.appendChild(self._container)

  self._videos = []

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
  opts.rotation = opts.rotation || 0
  opts.transform = opts.transform || null

  // If it is the same MediaStream, we can reuse our video element
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
    self._container.appendChild(video)
    video.src = window.URL.createObjectURL(mediaStream)
  }

  opts.element = video
  opts.id = mediaStream.id || null
  self._videos.push(opts)
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  var self = this

  var found = false

  for (var i = 0; i < self._videos.length; i++) {
    if (mediaStream.id === self._videos[i].id) {
      self._container.removeChild(self._videos[i].element)
      self._videos[i] = null
      self._videos.splice(i, 1)
      found = true // keep going, duplicates
    }
  }

  if (!found) throw new Error('Provided stream was never added')
}

VideoStreamMerger.prototype.start = function () {
  var self = this

  self.started = true
  window.requestAnimationFrame(self._draw.bind(self))
  self.result = self._canvas.captureStream(self.fps)
}

VideoStreamMerger.prototype._draw = function () {
  var self = this
  if (!self.started) return

  var awaiting = self._videos.length
  function done () {
    awaiting--
    if (!awaiting) window.requestAnimationFrame(self._draw.bind(self))
  }

  self._videos.forEach(function (video) {
    if (video.draw) { // custom frame transform
      video.draw(self._ctx, video.element, done)
    } else {
      self._ctx.drawImage(video.element, video.x, video.y, video.width, video.height)
      done()
    }
  })
}

VideoStreamMerger.prototype.stop = function () {
  var self = this

  self.started = false
}

VideoStreamMerger.prototype.destroy = function () {
  var self = this

  self.started = false

  document.body.removeChild(self._canvas)
  document.body.removeChild(self._container)

  self._canvas = null
  self._ctx = null
  self._container = null
  self._videos = []
}

module.exports = VideoStreamMerger
