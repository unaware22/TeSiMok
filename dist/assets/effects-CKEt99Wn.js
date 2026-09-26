function m(t,n=100,s=1){if(!t||typeof t.getBoundingClientRect!="function")return;const o=t.getBoundingClientRect(),e=o.left+o.width/2,c=o.top;t.classList.remove("btn-pop-success"),t.offsetWidth,t.classList.add("btn-pop-success"),setTimeout(()=>t.classList.remove("btn-pop-success"),400),u(e,c,n,s)}function u(t,n,s,o=1){const e=document.createElement("div");e.className="fx-point-popup",e.style.left=`${t}px`,e.style.top=`${Math.max(30,n-18)}px`;const c=s>0?`+${s}`:"Benar!";e.innerHTML=`
    <div class="fx-point-popup__core">
      <span class="fx-point-popup__val">${c}</span>
      ${o>1?`<span class="fx-point-popup__streak">x${o}</span>`:""}
    </div>
  `,document.body.appendChild(e),setTimeout(()=>{e.remove()},950)}function l(){const t=document.createElement("div");t.className="confetti-wrap",t.setAttribute("aria-hidden","true");const n=["#F59E0B","#10B981","#38BDF8","#EC4899","#8B5CF6","#FACC15"],s=36;for(let o=0;o<s;o++){const e=document.createElement("div");e.className="confetti-piece";const c=n[o%n.length],a=Math.random()*100,i=6+Math.random()*8,p=1.6+Math.random()*1.2,r=Math.random()*.4,d=Math.random()*360;e.style.cssText=`
      position: absolute;
      left: ${a}%;
      top: -12px;
      width: ${i}px;
      height: ${i*(Math.random()>.4?1.6:1)}px;
      background: ${c};
      border-radius: ${Math.random()>.5?"2px":"50%"};
      transform: rotate(${d}deg);
      animation: confetti-fall ${p}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${r}s forwards;
      opacity: 0.9;
    `,t.appendChild(e)}document.body.appendChild(t),setTimeout(()=>t.remove(),3200)}export{l as a,m as t};
