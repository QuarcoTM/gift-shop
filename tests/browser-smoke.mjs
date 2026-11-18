/**
 * End-to-end real-browser first-paint check. Run in CI with Chromium installed.
 * External APIs are intentionally left pending: the page must never be blank.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";

const source=readFileSync("index.html","utf8");
const browser=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"]
  .find((p)=>existsSync(p));
if(!browser)throw Error("A real Chrome/Chromium installation is required");
const head=['<script>window.fetch=function(){return new Promise(function(){})};</script>'].join("\n");
const body=[
  '<output id="smoke-result"></output>',
  '<script>',
  'document.addEventListener("DOMContentLoaded",function(){',
  'var theme=new URL(location.href).searchParams.get("campaign")||"valentine";',
  'var visible=Array.from(document.querySelectorAll(".hero-copy h1 [data-season-content]")).filter(function(e){return getComputedStyle(e).display!=="none"});',
  'var photo=document.querySelector(".hero-image .seasonal-photo");',
  'var bg=photo?getComputedStyle(photo).backgroundImage:"missing";',
  'var area=document.querySelector(".hero").getBoundingClientRect();',
  'var passed=visible.length===1&&visible[0].dataset.seasonContent===theme&&bg.indexOf(theme+".webp")!==-1&&area.height>200;',
  'document.getElementById("smoke-result").textContent="SMOKE_RESULT:"+theme+":"+(passed?"PASS":"FAIL")+":visible="+visible.length+":photo="+bg+":height="+Math.round(area.height);',
  '});',
  '</script>'
].join("\n");
writeFileSync("smoke-holiday.html",source.replace("</head>",head+"</head>").replace("</body>",body+"</body>"));
const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1"],{stdio:"ignore"});
try{
  let failures=0;
  for(const theme of ["christmas","easter","valentine","womens_day","martenitsa","everyday"]){
    let output="";
    for(let n=0;n<4;n++){
      try{
        output=execFileSync(browser,[
          "--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
          "--disable-extensions","--disable-background-networking","--window-size=390,844",
          "--virtual-time-budget=1400","--dump-dom",
          "http://127.0.0.1:8765/smoke-holiday.html?campaign="+theme
        ],{encoding:"utf8",timeout:22000,stdio:["ignore","pipe","ignore"]});
        break;
      }catch(error){
        if(n===3)throw error;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }
    const result=output.match(/SMOKE_RESULT:[^<]+/)?.[0]||"NO BROWSER RESULT";
    console.log(theme+": "+result);
    if(!result.startsWith("SMOKE_RESULT:"+theme+":PASS"))failures++;
  }
  if(failures)throw Error(failures+" holiday themes failed real-browser rendering");
}finally{
  server.kill("SIGTERM");
  try{unlinkSync("smoke-holiday.html")}catch{}
}
