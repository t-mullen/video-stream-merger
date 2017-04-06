# video-stream-merger
Merge the video of multiple MediaStreams.   
Also merges the audio via the WebAudio API.  
Useful for sending composite videos across a single WebRTC MediaConnection, or hot-swapping streams without stopping. 
[Demo](https://rationalcoding.github.io/video-stream-merger/)

`npm install video-stream-merger`

**Example:**
```javascript
// Create a new VideoStreamMerger with an output width, height and fps
var merger = new VideoStreamMerger({
  width: 400,
  height: 300,  // Omit options to use these defaults
  fps: 25
}) 

// Add one stream the full size of the stream
merger.addStream(inputStream)

// Add another stream at the top-left, 100 pixels wide and tall
merger.addStream(anotherStream, {
  x: 0,
  y: 0,
  width: 100,  // stretch stream to be 100px by 100px
  height: 100,
  muted: false
}) 

// Or draw the frames yourself
merger.addStream(anotherStream, {
  draw: function (ctx, frame, done) {
    ctx.drawImage(frame, 5, 3, 100, 100)
    done()
  }
})

merger.start() // Begin merging the videos (the result is now available)

merger.result // The result is the composite MediaStream

merger.destroy() // Clean up (stream will stop, cannot be restarted)
```
