# video-stream-merger
Merge the video of multiple MediaStreams.   
Useful for sending composite videos across a single WebRTC MediaConnection.  
[Demo](https://rationalcoding.github.io/video-stream-merger/)

**Example:**
```javascript
var width = 500,
    height = 500,
    fps = 30;
    
var x = 0, y = 0;

var videoMerger = new VideoStreamMerger(width, height, fps); // Create a new videoMerger with an output width, height and fps

videoMerger.addStream(inputStream, x, y, width, height); // Add one stream the full size of the stream
videoMerger.addStream(anotherStream, 0, 0, 100, 100); // Add another stream at the top-left, 100 pixels wide and tall

videoMerger.merge(); // Begin merging the videos (the result is now available)

videoMerger.result; // The result is the composite video stream
```

## Limitations:
- Output stream will have no audio. (Merge audio streams separately with WebAudio API)
