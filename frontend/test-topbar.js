"use strict";
/* Dependency-free interaction test: real topbar.js, mocked browser DOM/API. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = p => fs.readFileSync(path.join(__dirname, p), "utf8");
const source = read("js/topbar.js");
for (const page of ["dashboard","transactions","budgets","reports","goals","settings"]) {
    const html = read(page + ".html");
    assert.equal((html.match(/<script src="js\/topbar\.js"><\/script>/g)||[]).length,1,page);
    assert.match(html,/data-lucide="bell"/);
}
class El {
    constructor(tag) {
        this.tagName=tag.toUpperCase(); this.children=[]; this.listeners={};
        this.attributes={}; this.hidden=false; this.id=""; this.className="";
        this.textContent=""; this.style={setProperty:(key,value)=>{this.style[key]=value;}};
        this.classList={
            add:(...v)=>{this.className+= " "+v.join(" ");},
            contains:v=>this.className.split(/\s+/).includes(v)
        };
    }
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k];}
    appendChild(c){this.children.push(c);c.parentElement=this;return c;}
    append(...items){items.forEach(x=>this.appendChild(x));}
    replaceChildren(...items){this.children=[];this.append(...items);}
    addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);}
    contains(t){return t===this||this.children.some(c=>c.contains(t));}
    getBoundingClientRect(){return {right:850,bottom:60};}
    querySelector(s){return s.startsWith(".") ? this.walk().find(x=>x!==this && x.classList.contains(s.slice(1)))||null : null;}
    walk(){return [this,...this.children.flatMap(c=>c.walk())];}
    focus(){this.focused=true;}
}
function setup(bellId){
    const bell=new El("button");bell.id=bellId;
    const dot=new El("span");dot.className="notification-dot";bell.append(dot);
    const profile=new El("div");profile.id="topProfile";
    const name=new El("span");name.id="topUserName";name.textContent="Temporary";
    const avatar=new El("div");avatar.id="topAvatar";profile.append(avatar,name);
    const head=new El("head"),body=new El("body"),listeners={};
    const all=()=>[bell,profile,avatar,name,...head.walk(),...body.walk()];
    const document={
        head,body,readyState:"complete",
        createElement:tag=>new El(tag),
        getElementById:id=>all().find(x=>x.id===id)||null,
        querySelector:()=>null
    };
    const store=new Map([["access_token","token"],["user_name","Test User"]]);
    const localStorage={
        getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),
        removeItem:k=>store.delete(k)
    };
    const location={replace:v=>{location.url=v;}};
    const window={
        innerWidth:1000,innerHeight:800,location,
        BUDGETWISE_API_BASE_URL:"https://api.test/api/v1",
        addEventListener:(k,fn)=>{(listeners[k] ||= []).push(fn);}
    };
    const results={
        "/dashboard":{income:100000,balance:10000,budgets:[
            {category:"Food",spent:90,budget:100}
        ]},
        "/goals":{goals:[{name:"Study",target_date:"2020-01-01",completed:false}]},
        "/expenses":{expenses:[{id:1,amount:500,category:"Food",date:"2026-10-16"}]},
        "/users/me":{id:7,name:"Test Person",email:"test@example.com"}
    };
    const calls=[];
    const fetch=async (url,opts)=>{
        calls.push(url);
        assert.equal(opts.headers.Authorization,"Bearer token");
        return {ok:true,status:200,json:async()=>results[url.split("/api/v1")[1]]};
    };
    vm.runInNewContext(source,{window,document,localStorage,fetch,
        Date,Intl,Math,Number,String,Set,Array,Object,Promise,console});
    const panel=document.getElementById("fhTopbarMenu");
    assert.ok(panel);
    function emit(type,target,key){
        const e={target,key,stopped:false,stopPropagation(){},
            preventDefault(){},stopImmediatePropagation(){this.stopped=true;}};
        for(const fn of (listeners[type]||[]))fn(e);
        return e;
    }
    return {bell,profile,avatar,name,dot,store,calls,location,panel,emit};
}
function contents(node){return node.walk().map(n=>n.textContent||"").join(" ");}
async function main(){
    for(const id of ["notificationButton","goalsNotificationButton","notificationBtn"]){
        const s=setup(id);
        assert.equal(s.calls.length,0,"No extra network calls on page startup");
        const event=s.emit("click",s.bell);
        assert.ok(event.stopped,"Existing duplicate page listeners suppressed");
        assert.equal(s.panel.hidden,false);
        assert.equal(s.bell.getAttribute("aria-expanded"),"true");
        await new Promise(r=>setImmediate(r));
        assert.match(contents(s.panel),/Food budget is near its limit/);
        assert.match(contents(s.panel),/Study is overdue/);
        assert.match(contents(s.panel),/Food recorded/);
        assert.equal(s.dot.style.display,"block");
        s.emit("click",s.profile);
        assert.equal(s.bell.getAttribute("aria-expanded"),"false");
        assert.equal(s.profile.getAttribute("aria-expanded"),"true");
        await new Promise(r=>setImmediate(r));
        assert.match(contents(s.panel),/Test Person/);
        assert.equal(s.name.textContent,"Test Person");
        assert.equal(s.avatar.textContent,"TP");
        assert.equal(s.panel.walk().filter(n=>n.tagName==="A").length,6);
        assert.ok(s.panel.walk().some(n=>n.href==="settings.html"));
        s.emit("keydown",s.profile,"Escape");
        assert.equal(s.panel.hidden,true);
        s.emit("keydown",s.profile,"Enter");
        assert.equal(s.panel.hidden,false,"Accessible keyboard activation");
        const logout=s.panel.walk().find(n=>n.tagName==="BUTTON" && contents(n).includes("Log out"));
        assert.ok(logout);
        logout.listeners.click[0]();
        assert.equal(s.store.has("access_token"),false);
        assert.equal(s.location.url,"login.html");
    }
    const off=setup("notificationButton");
    off.store.set("budgetwise_notifications",JSON.stringify({
        budgetAlerts:false, goalReminders:false, transactionNotifications:false
    }));
    off.emit("click",off.bell);
    await new Promise(r=>setImmediate(r));
    assert.doesNotMatch(contents(off.panel),/budget is near its limit/);
    assert.doesNotMatch(contents(off.panel),/Study is overdue/);
    assert.doesNotMatch(contents(off.panel),/Food recorded/);
    assert.equal(off.dot.style.display,"none");
    console.log("Shared FundHaven topbar interaction tests passed");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
