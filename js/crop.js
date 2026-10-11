"use strict";
(() => {
const $=id=>document.getElementById(id);
const input=$('fileInput'),stage=$('cropCanvas'),ctx=stage.getContext('2d'),ratio=$('ratio');
const rotateLeft=$('rotateLeft'),rotateRight=$('rotateRight'),reset=$('reset'),download=$('download'),status=$('cropStatus');
let bmp=null,angle=0,box=null,drag=null,filename='image',processing=false;
const MAX_PIXELS=40_000_000,MAX_SIDE=8192;
function dims(){return angle%180===0?[bmp.width,bmp.height]:[bmp.height,bmp.width]}
function ratioValue(){return ratio.value==='free'?null:Number(ratio.value)}
function fitSelection(){const [w,h]=dims();let sw=w*.78,sh=h*.78;const r=ratioValue();if(r){if(sw/sh>r)sw=sh*r;else sh=sw/r;}box={x:(w-sw)/2,y:(h-sh)/2,w:sw,h:sh};}
function bounds(x,y){const [w,h]=dims();return {x:Math.min(w,Math.max(0,x)),y:Math.min(h,Math.max(0,y))}}
function drawPicture(c,w,h){c.save();c.translate(w/2,h/2);c.rotate(angle*Math.PI/180);c.drawImage(bmp,-bmp.width/2,-bmp.height/2);c.restore();}
function redraw(){if(!bmp)return;const [w,h]=dims();stage.width=w;stage.height=h;ctx.clearRect(0,0,w,h);drawPicture(ctx,w,h);if(!box)return;ctx.save();ctx.fillStyle='rgba(0,0,0,.48)';ctx.fillRect(0,0,w,h);ctx.clearRect(box.x,box.y,box.w,box.h);ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();drawPicture(ctx,w,h);ctx.restore();ctx.strokeStyle='#e4eaff';ctx.lineWidth=Math.max(1,Math.min(w,h)/500);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.restore();status.textContent=`選取區域 ${Math.round(box.w)} × ${Math.round(box.h)} px`}
function pointer(e){const r=stage.getBoundingClientRect();return bounds((e.clientX-r.left)*stage.width/r.width,(e.clientY-r.top)*stage.height/r.height)}
stage.addEventListener('pointerdown',e=>{if(!bmp||processing)return;drag=pointer(e);stage.setPointerCapture(e.pointerId);});
stage.addEventListener('pointermove',e=>{if(!drag||!bmp)return;let a=drag,b=pointer(e);let x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);let r=ratioValue();if(r){const dirx=b.x>=a.x?1:-1,diry=b.y>=a.y?1:-1;const [W,H]=dims();w=Math.min(w,h*r,W-(dirx>0?a.x:W-a.x));h=w/r;if(h>H-(diry>0?a.y:H-a.y)){h=H-(diry>0?a.y:H-a.y);w=h*r;}x=dirx>0?a.x:a.x-w;y=diry>0?a.y:a.y-h;}if(w>=2&&h>=2){box={x,y,w,h};redraw();}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>{drag=null});
async function load(file){if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024){status.textContent='檔案格式不支援或超過 20 MB';return;}processing=true;try{const next=await createImageBitmap(file,{imageOrientation:'from-image'});if(next.width>MAX_SIDE||next.height>MAX_SIDE||next.width*next.height>MAX_PIXELS)throw Error('解析度超過支援範圍');if(bmp)bmp.close();bmp=next;filename=file.name.replace(/\.[^.]+$/,'');angle=0;fitSelection();redraw();for(const el of [rotateLeft,rotateRight,reset,download])el.disabled=false;$('fileInfo').textContent=`${file.name}｜${bmp.width} × ${bmp.height}`;}catch(e){status.textContent='讀取圖片失敗：'+e.message;}finally{processing=false;input.value='';}}
input.addEventListener('change',()=>load(input.files[0]));ratio.addEventListener('change',()=>{if(bmp){fitSelection();redraw();}});
function rotate(deg){if(!bmp)return;angle=(angle+deg+360)%360;fitSelection();redraw()}
rotateLeft.addEventListener('click',()=>rotate(-90));rotateRight.addEventListener('click',()=>rotate(90));reset.addEventListener('click',()=>{if(bmp){fitSelection();redraw()}});
download.addEventListener('click',async()=>{if(!bmp||!box||processing)return;const w=Math.max(1,Math.round(box.w)),h=Math.max(1,Math.round(box.h));const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.translate(-box.x,-box.y);const [W,H]=dims();drawPicture(g,W,H);c.toBlob(blob=>{c.width=c.height=0;if(!blob){status.textContent='匯出失敗';return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${filename}-cropped.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);status.textContent='PNG 已開始下載';},'image/png');});
window.addEventListener('beforeunload',()=>bmp?.close());$('year').textContent=new Date().getFullYear();
})();
