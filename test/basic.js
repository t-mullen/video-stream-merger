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
  var videoElement = document.createElement('video')
  videoElement.autoplay = true
  videoElement.muted = false
  videoElement.src = 'test/buckbunny.webm'
  merger.addMediaElement('myVideo', videoElement, {
    x: 100,
    y: 0,
    width: 100,
    height: 100,
    muted: false
  })
  merger.addMediaElement('myDuplicateVideo', videoElement, {
    x: 150,
    y: 0,
    width: 100,
    height: 100,
    muted: false
  })
  window.setTimeout(() => {
    merger.removeStream('myVideo')
  }, 3000)

  merger.addStream(mediaStream, {
    width: 100,
    height: 100,
    x: merger.width - 100,
    y: merger.height - 100,
    index: 1
  })
  merger.addStream('data', {
    index: 0,
    draw: function (ctx, frame, done) {
      ctx.fillStyle = 'yellow';
      ctx.fillRect(0, 0, 50, 50);
      t.equal(null, frame)
      done()
    },
    audioEffect: function (source, dest) {
      t.equals(null, source)
    }
  })
  merger.updateIndex('data', 2)

  merger.start()

  t.pass('merger started')

  playVideo.oncanplay = function () {
    t.pass('video can play')

    window.setTimeout(function () {
      merger.removeStream(mediaStream)
      merger.removeStream('data')
      t.pass('removed')
      
      window.setTimeout(function () {
        merger.addStream(mediaStream, {
          draw: function (ctx, frame, done) {
            ctx.drawImage(frame, 0, 0, 150, 150)
            done()
          }
        })
        t.pass('readded')
      
        window.setTimeout(function () {
          merger.destroy()
          t.pass('destroyed')
          t.end()
        }, 4000)
      }, 2000)
      
    }, 4000)
  }
  playVideo.srcObject = merger.result
})
