/* global document, window */

function CanvasBackend(opts) {
  if (!(this instanceof CanvasBackend)) return new CanvasBackend(opts)

  const canvasSupport = !!document.createElement('canvas').captureStream
  if (!canvasSupport) {
    throw new Error('video backend "Canvas" is not supported in this browser')
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

CanvasBackend.prototype.createSourceFromElement = function (videoElement) {
  return videoElement
}

CanvasBackend.prototype.createSourceFromMediaStream = function (mediaStream) {
  const videoElement = document.createElement('video')
  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.srcObject = mediaStream
  videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; pointer-events: none; opacity:0;')
  document.body.appendChild(videoElement)
  return videoElement
}

CanvasBackend.prototype.setResolution = function (width, height) {
  this.width = width
  this.height = height
  this._canvas.setAttribute('width', width)
  this._canvas.setAttribute('height', height)
}

CanvasBackend.prototype.getContext = function () {
  return this._ctx
}

CanvasBackend.prototype.clear = function () {
  this._ctx.clearRect(0, 0, this.width, this.height)
}

CanvasBackend.prototype.drawVideoSource = function (videoSource, x, y, width, height) {
  this._ctx.drawImage(videoSource, x, y, width, height)
}

CanvasBackend.prototype.getOutputMediaStream = function () {
  const mediaStream = this._canvas.captureStream(this.fps)

  // Remove "dead" audio tracks
  mediaStream.getAudioTracks().forEach(deadTrack => {
    mediaStream.removeTrack(deadTrack)
  })

  return mediaStream
}

CanvasBackend.prototype.destroyVideoSource = function (videoSource) {
  videoSource.remove()
}

// Wrapper around requestAnimationFrame and setInterval to avoid background throttling
CanvasBackend.prototype.requestAnimationFrame = function (callback) {
  let fired = false
  const interval = setInterval(() => {
    if (!fired && document.hidden) {
      fired = true
      clearInterval(interval)
      callback()
    }
  }, 1000 / this.fps)
  requestAnimationFrame(() => {
    if (!fired) {
      fired = true
      clearInterval(interval)
      callback()
    }
  })
}

CanvasBackend.prototype.destroy = function () {
  this._canvas = null
  this._ctx = null
}

module.exports = CanvasBackend