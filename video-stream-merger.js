window.URL = window.URL || window.webkitURL;

navigator.getUserMedia  = navigator.getUserMedia || 
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMedia || 
                          navigator.msGetUserMedia;

window.requestAnimationFrame = window.requestAnimationFrame ||
                               window.webkitRequestAnimationFrame ||
                               window.mozRequestAnimationFrame ||
                               window.msRequestAnimationFrame ||
                               window.oRequestAnimationFrame;

function videoStreamMerger(width, height, fps) {
    
    if (fps === undefined) {
        fps = 25;
    }
    
    // Create the canvas where video will be merged
    var canvas = document.createElement('canvas');
    canvas.setAttribute('width', width);
    canvas.setAttribute('height', height);
    canvas.setAttribute('style', 'position:fixed;left:-'+width+10+'px;'); // Cannot hide canvas, but can move offscreen
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    
    // Hidden stream container for dynamic loading of video
    var streamContainer = document.createElement('div');
    document.body.appendChild(streamContainer);
    
    var streams = [];
    
    this.addStream = function addStream(stream, x, y, width, height) {
        // Create a hidden video to create frames from
        var video = document.createElement('video');
        video.setAttribute('autoplay', '1');
        video.setAttribute('style', 'display:none');
        streamContainer.appendChild(video);
        
        video.src = window.URL.createObjectURL(stream);
        
        streams.push({
            video : video,
            x : x,
            y : y,
            width : width,
            height : height
        });
        
    };
    
    this.merge = function merge() {
        var drawLoop = function() {
            // Draw frames
            for (var i=0; i<streams.length; i++){
                ctx.drawImage(streams[i].video, streams[i].x, streams[i].y, streams[i].width, streams[i].height);
            }
            
            requestAnimationFrame(drawLoop);
        }
        requestAnimationFrame(drawLoop);
        
        this.result = canvas.captureStream(fps); // Capture the canvas as video stream
    };
    
    this.result = null;
}
