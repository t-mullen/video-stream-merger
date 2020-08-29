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

  return { videoElement }
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