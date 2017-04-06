var test = require('tape')
var VideoStreamMerger = require('../src/index')
var getusermedia = require('getusermedia')

var mediaStream

test('get media stream', function (t) {
  getusermedia({audio: true, video: true}, function (err, stream) {
    if (err) t.fail(err)
    mediaStream = stream
    t.end()
  })
})

var playVideo = document.createElement('video')
playVideo.autoplay = true
playVideo.setAttribute('style', 'position: fixed; top: 200px;')
document.body.appendChild(playVideo)

test('e2e', function (t) {
  var merger = new VideoStreamMerger({
    width: 1000,
    height: 300,
    fps: 20
  })

  var tick = 0
  merger.addStream(mediaStream, {
    draw: function (ctx, frame, done) {
      tick++
      ctx.drawImage(frame, 0, 0, merger.width/2+tick, merger.height)
      done()
    }
  })
  merger.addStream(mediaStream, {
    width: 100,
    height: 100
  })
  merger.addStream(mediaStream, {
    width: 100,
    height: 100,
    x: merger.width - 100,
    y: merger.height - 100
  })

  merger.start()

  t.pass('merger started')

  playVideo.oncanplay = function () {
    t.pass('video can play')

    window.setTimeout(function () {
      merger.stop()
      merger.start()
      t.pass('stopped and started')
      window.setTimeout(function () {
        merger.destroy()
        t.pass('destroyed')
        t.end()
      }, 5000)
    }, 5000)
  }
  playVideo.src = window.URL.createObjectURL(merger.result)
})
