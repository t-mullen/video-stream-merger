
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