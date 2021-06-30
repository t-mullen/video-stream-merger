!function(t,e){"object"==typeof exports&&"object"==typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):"object"==typeof exports?exports["video-stream-merger"]=e():t["video-stream-merger"]=e()}(this,(function(){return function(){"use strict";var t={d:function(e,i){for(var s in i)t.o(i,s)&&!t.o(e,s)&&Object.defineProperty(e,s,{enumerable:!0,get:i[s]})},o:function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},r:function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})}},e={};t.r(e),t.d(e,{VideoStreamMerger:function(){return i}});class i{constructor(t){this.width=720,this.height=405,this.fps=25,this._streams=[],this._frameCount=0,this.clearRect=!0,this.started=!1,this.result=null,this.supported=null,this._canvas=null,this._ctx=null,this._videoSyncDelayNode=null,this._audioDestination=null,this._audioCtx=null;const e=window.AudioContext||window.webkitAudioContext,i=!(!window.AudioContext||!(new e).createMediaStreamDestination),s=!!document.createElement("canvas").captureStream;if(!(this.supported=i&&s))return;this.setOptions(t);const a=this._audioCtx=new e,o=this._audioDestination=null==a?void 0:a.createMediaStreamDestination();this._videoSyncDelayNode=a.createDelay(5),this._videoSyncDelayNode.connect(o),this._setupConstantNode(),this.started=!1,this.result=null,this._backgroundAudioHack()}setOptions(t){t=t||{},this._audioCtx=t.audioContext||new AudioContext,this.width=t.width||this.width,this.height=t.height||this.width,this.fps=t.fps||this.fps,this.clearRect=void 0===t.clearRect||t.clearRect}setOutputSize(t,e){this.width=t,this.height=e,this._canvas&&(this._canvas.setAttribute("width",this.width.toString()),this._canvas.setAttribute("height",this.height.toString()))}getAudioContext(){return this._audioCtx}getAudioDestination(){return this._audioDestination}getCanvasContext(){return this._ctx}_backgroundAudioHack(){if(this._audioCtx){const t=this._createConstantSource(),e=this._audioCtx.createGain();e&&t&&(e.gain.value=.001,t.connect(e),e.connect(this._audioCtx.destination),t.start())}}_setupConstantNode(){if(this._audioCtx&&this._videoSyncDelayNode){const t=this._createConstantSource();if(t){t.start();const e=this._audioCtx.createGain();e.gain.value=0,t.connect(e),e.connect(this._videoSyncDelayNode)}}}_createConstantSource(){if(this._audioCtx){if(this._audioCtx.createConstantSource)return this._audioCtx.createConstantSource();const t=this._audioCtx.createBufferSource(),e=this._audioCtx.createBuffer(1,1,this._audioCtx.sampleRate);return e.getChannelData(0)[0]=10,t.buffer=e,t.loop=!0,t}}updateIndex(t,e){"string"==typeof t&&(t={id:t}),e=null==e?0:e;for(let i=0;i<this._streams.length;i++)t.id===this._streams[i].id&&(this._streams[i].index=e);this._sortStreams()}_sortStreams(){this._streams=this._streams.sort(((t,e)=>t.index-e.index))}addMediaElement(t,e,i){if((i=i||{}).x=i.x||0,i.y=i.y||0,i.width=i.width||this.width,i.height=i.height||this.height,i.mute=i.mute||i.muted||!1,i.oldDraw=i.draw,i.oldAudioEffect=i.audioEffect,e instanceof HTMLVideoElement||e instanceof HTMLImageElement?i.draw=(t,s,a)=>{if(i.oldDraw)i.oldDraw(t,e,a);else{const s=null==i.width?this.width:i.width,o=null==i.height?this.height:i.height;t.drawImage(e,i.x,i.y,s,o),a()}}:i.draw=null,this._audioCtx&&!i.mute){const t=e._mediaElementSource||this._audioCtx.createMediaElementSource(e);e._mediaElementSource=t,t.connect(this._audioCtx.destination);const s=this._audioCtx.createGain();t.connect(s),(e instanceof HTMLVideoElement||e instanceof HTMLAudioElement)&&e.muted?(e.muted=!1,e.volume=.001,s.gain.value=1e3):s.gain.value=1,i.audioEffect=(t,e)=>{i.oldAudioEffect?i.oldAudioEffect(s,e):s.connect(e)},i.oldAudioEffect=null}this.addStream(t,i)}addStream(t,e){if("string"==typeof t)return this._addData(t,e);e=e||{};const i={isData:!1};i.x=e.x||0,i.y=e.y||0,i.width=e.width,i.height=e.height,i.draw=e.draw||null,i.mute=e.mute||e.muted||!1,i.audioEffect=e.audioEffect||null,i.index=null==e.index?0:e.index,i.hasVideo=t.getVideoTracks().length>0,i.hasAudio=t.getAudioTracks().length>0;let s=null;for(let e=0;e<this._streams.length;e++)this._streams[e].id===t.id&&(s=this._streams[e].element);s||(s=document.createElement("video"),s.autoplay=!0,s.muted=!0,s.playsInline=!0,s.srcObject=t,s.setAttribute("style","position:fixed; left: 0px; top:0px; pointer-events: none; opacity:0;"),document.body.appendChild(s),s.play().catch(null),i.hasAudio&&this._audioCtx&&!i.mute&&(i.audioSource=this._audioCtx.createMediaStreamSource(t),i.audioOutput=this._audioCtx.createGain(),i.audioOutput.gain.value=1,i.audioEffect?i.audioEffect(i.audioSource,i.audioOutput):i.audioSource.connect(i.audioOutput),i.audioOutput.connect(this._videoSyncDelayNode))),i.element=s,i.id=t.id||null,this._streams.push(i),this._sortStreams()}removeStream(t){"string"==typeof t&&(t={id:t});for(let e=0;e<this._streams.length;e++){const i=this._streams[e];t.id===i.id&&(i.audioSource&&(i.audioSource=null),i.audioOutput&&(i.audioOutput.disconnect(this._videoSyncDelayNode),i.audioOutput=null),i.element&&i.element.remove(),this._streams[e]=null,this._streams.splice(e,1),e--)}}_addData(t,e){e=e||{};const i={isData:!0};i.draw=e.draw||null,i.audioEffect=e.audioEffect||null,i.id=t,i.element=null,i.index=null==e.index?0:e.index,this._videoSyncDelayNode&&this._audioCtx&&i.audioEffect&&(i.audioOutput=this._audioCtx.createGain(),i.audioOutput.gain.value=1,i.audioEffect(null,i.audioOutput),i.audioOutput.connect(this._videoSyncDelayNode)),this._streams.push(i),this._sortStreams()}_requestAnimationFrame(t){let e=!1;const i=setInterval((()=>{!e&&document.hidden&&(e=!0,clearInterval(i),t())}),1e3/this.fps);requestAnimationFrame((()=>{e||(e=!0,clearInterval(i),t())}))}start(){var t,e,i,s,a;this._canvas=document.createElement("canvas"),this._canvas.setAttribute("width",this.width.toString()),this._canvas.setAttribute("height",this.height.toString()),this._canvas.setAttribute("style","position:fixed; left: 110%; pointer-events: none"),this._ctx=this._canvas.getContext("2d"),this.started=!0,this._requestAnimationFrame(this._draw.bind(this)),this.result=(null===(t=this._canvas)||void 0===t?void 0:t.captureStream(this.fps))||null;const o=null===(e=this.result)||void 0===e?void 0:e.getAudioTracks()[0];o&&(null===(i=this.result)||void 0===i||i.removeTrack(o));const n=null===(s=this._audioDestination)||void 0===s?void 0:s.stream.getAudioTracks();n&&n.length&&(null===(a=this.result)||void 0===a||a.addTrack(n[0]))}_updateAudioDelay(t){this._videoSyncDelayNode&&this._audioCtx&&this._videoSyncDelayNode.delayTime.setValueAtTime(t/1e3,this._audioCtx.currentTime)}_draw(){var t;if(!this.started)return;this._frameCount++;let e=0;this._frameCount%60==0&&(e=performance.now());let i=this._streams.length;const s=()=>{if(i--,i<=0){if(this._frameCount%60==0){const t=performance.now();this._updateAudioDelay(t-e)}this._requestAnimationFrame(this._draw.bind(this))}};this.clearRect&&(null===(t=this._ctx)||void 0===t||t.clearRect(0,0,this.width,this.height)),this._streams.forEach((t=>{t.draw?t.draw(this._ctx,t.element,s):!t.isData&&t.hasVideo?(this._drawVideo(t.element,t),s()):s()})),0===this._streams.length&&s()}_drawVideo(t,e){var i;const s=this.height,a=this.width,o=e.height||s,n=e.width||a;let d=e.x||0,u=e.Y||0;try{null===(i=this._ctx)||void 0===i||i.drawImage(t,d,u,n,o)}catch(t){console.error(t)}}stop(){var t,e;this.started=!1,this._canvas=null,this._ctx=null,this._streams.forEach((t=>{t.element&&t.element.remove()})),this._streams=[],null===(t=this._audioCtx)||void 0===t||t.close(),this._audioCtx=null,this._audioDestination=null,this._videoSyncDelayNode=null,null===(e=this.result)||void 0===e||e.getTracks().forEach((t=>{t.stop()})),this.result=null}destroy(){this.stop()}}return"undefined"!=typeof window&&(window.VideoStreamMerger=i),e}()}));