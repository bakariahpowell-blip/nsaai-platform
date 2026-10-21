import { auth, db, storage } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadString,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* The NSAAI App — Demo SPA with requested updates */

/* =======================================================
   Utilities
======================================================= */
const $  = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => Array.from(root.querySelectorAll(q));
const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
function syncTopbarHeight(){
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  const height = Math.ceil(topbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--topbar-h", `${height}px`);
}

function alphaKey(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .trim();
}

function sortABC(arr, field){
  return [...arr].sort((a, b) =>
    alphaKey(a[field]).localeCompare(alphaKey(b[field]), undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

/* =======================================================
   Theme (Dark/Light) + Persistence
======================================================= */
const THEME_KEY = "ns-theme-v1";
const SIDE_MENU_COLLAPSED_KEY = "ns-side-menu-collapsed-v1";

function getPreferredTheme(){
  // 1) saved choice
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;

  // 2) system preference fallback
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

function setMetaThemeColor(theme){
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;

  // Match your surfaces so mobile browser chrome looks correct
  meta.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");
}

function updateThemeToggleUI(theme){
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  if (theme === "light"){
    btn.textContent = "☀️ Light";
    btn.setAttribute("aria-label", "Switch to dark mode");
  } else {
    btn.textContent = "🌙 Dark";
    btn.setAttribute("aria-label", "Switch to light mode");
  }
}

function applyTheme(theme){
  const t = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);
  updateThemeToggleUI(t);
  setMetaThemeColor(t);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

/* =======================================================
   Network Demo Photos (Men/Women)
======================================================= */
const MEN_PHOTOS = [
  "https://i.postimg.cc/Q9132L9j/man-1.jpg",
  "https://i.postimg.cc/hQnBgCTF/man-2.jpg",
  "https://i.postimg.cc/N2tcYNmw/man-3.jpg",
  "https://i.postimg.cc/8fGSDyMQ/man-4.jpg",
  "https://i.postimg.cc/2LYDmHhD/man-5.jpg",
  "https://i.postimg.cc/K3b2F9BF/man-6.jpg",
  "https://i.postimg.cc/K3b2F9Bc/man-7.jpg",
  "https://i.postimg.cc/5QJV1PLN/man-8.jpg",
  "https://i.postimg.cc/D4hTFCLz/man-9.jpg",
];

const WOMEN_PHOTOS = [
  "https://i.postimg.cc/2LYDmHhy/woman-1.jpg",
  "https://i.postimg.cc/WqVvj9gr/woman-10.jpg",
  "https://i.postimg.cc/7J4kDB00/woman-11.jpg",
  "https://i.postimg.cc/dZFYvWrG/woman-12.jpg",
  "https://i.postimg.cc/jnTbK8Pz/woman-13.jpg",
  "https://i.postimg.cc/FkxQKjV7/woman-14.jpg",
  "https://i.postimg.cc/8fbVChmJ/woman-15.jpg",
  "https://i.postimg.cc/H8tCLQ98/woman-16.jpg",
  "https://i.postimg.cc/n91tLvGQ/woman-17.jpg",
  "https://i.postimg.cc/9w2hVxZr/woman-2.jpg",
  "https://i.postimg.cc/4H1T3zQK/woman-3.jpg",
  "https://i.postimg.cc/xNQ2YsMk/woman-4.jpg",
  "https://i.postimg.cc/0KvsxtDz/woman-5.jpg",
  "https://i.postimg.cc/Cn0gYvkB/woman-6.jpg",
  "https://i.postimg.cc/kRCm9jKR/woman-7.jpg",
  "https://i.postimg.cc/ctWSZDwn/woman-8.jpg",
  "https://i.postimg.cc/rRTkchx4/woman-9.jpg",
];

// deterministic "random" so faces stay the same for each person
function hashStringToIndex(str, mod) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return mod ? (h % mod) : 0;
}

function pickStableAvatar(gender, key) {
  const pool = (gender === "woman") ? WOMEN_PHOTOS : MEN_PHOTOS;
  const idx = hashStringToIndex(key, pool.length);
  return pool[idx];
}

function getCommunityAvatarFromName(nameOrAuthor){
  const raw = String(nameOrAuthor || "").trim();

  // remove "(Howard)" / "(NC A&T)" etc from feed author strings
  const cleanName = raw.split(" (")[0].trim();

  // try to match seeded network person first
  const matchedPerson = (PEOPLE || []).find(p => (p.name || "").trim() === cleanName);
  if (matchedPerson?.avatarUrl) return matchedPerson.avatarUrl;

  // fallback: infer gender from first name and generate stable avatar
  const gender = guessGenderFromFirstName(cleanName);
  return pickStableAvatar(gender, `community-${cleanName}`);
}

// simple gender guess so we can auto-assign without changing FIRST[] names
function guessGenderFromFirstName(fullName) {
  const first = (fullName || "").trim().split(/\s+/)[0].toLowerCase();

  // these are already in your FIRST[] list
  const likelyWomen = new Set([
    "jasmine","sanaa","maya","zara","aaliyah","imani","sade","nia","keisha","lena","jade",
    "simone","kendra","ayana","tiara","naomi","renee","ebony","danielle","leah","talia",
    "jordin","aminah","ari","selah","milan","rashida","imara","janelle","kaya","nyla"
  ]);

  return likelyWomen.has(first) ? "woman" : "man";
}



/* =======================================================
   Seed data
======================================================= */
const FIRST = ["Jasmine","Andre","Sanaa","Terrell","Maya","Kwame","Zara","Jordan","Aaliyah","Noah","Imani","Sade","Malik","Nia","Tariq","Keisha","Omar","Priya","DeShawn","Lena","Carlos","Jade","Bryce","Simone","Davon","Kendra","Micah","Ayana","Darius","Tiara","Kofi","Naomi","Marvin","Renee","Tobias","Ebony","Jamal","Danielle","Leah","Quincy","Talia","Jordin","Aminah","Marcus","Ari","Selah","Caleb","Milan","Hakeem","Rashida","Cameron","Imara","Akil","Janelle","Kaya","Tyrese","Javon","Nyla"];
const LAST  = ["Brooks","Mitchell","Kader","Owens","Harper","Boateng","Lewis","Fields","Chen","Spencer","Rhodes","Williams","Carter","Thompson","Johnson","Brown","Daniels","Patel","Miller","Okafor","Rivera","Nguyen","Allen","Harris","Robinson","Moore","Jackson","Davis","Clark","Bennett","Nelson","Parker","Green","Hill","Bryant","Wright","Foster","Reed","Coleman","Powell","Bailey","Grant","Kelly","Howard","Henderson","Simmons","Alexander","Price","Bell","Cooper","Ward","Turner","Ross","Barnes","Chambers","Jennings","Collins","Hughes"];
const SCHOOLS = ["North Carolina A&T","Howard University","Spelman College","Morehouse College","FAMU","Hampton University","Tuskegee University","Morgan State","Stanford University","MIT","Georgia Tech","UCLA","UF","NC State","UMD","UT Austin"];
const ROLES = ["Student","Graduate","Innovator","Founder","Researcher"];
const SKILLS = ["Product","AI","Data","Design","Robotics","EdTech","Clean Energy","HealthTech","FinTech","UX","ML","VR/AR"];
const AFFIN = ["Black in Product","AI Builders","Design Circle"];
const BIOS = [
  "Product designer focused on equitable tools for first-gen students.",
  "CS undergrad building AI for campus wellness and safety.",
  "Community organizer turned founder—edtech + micro-scholarships.",
  "Electrical engineering student exploring clean energy hardware.",
  "MBA candidate researching inclusive venture models.",
  "Human-centered researcher with a love for co-creation.",
  "Data scientist turning public datasets into community insights.",
  "XR tinkerer prototyping AR campus tours.",
  "HealthTech advocate focused on maternal health outcomes.",
  "Civic hacker mapping food deserts and transit gaps."
];

function rp(a){ return a[Math.floor(Math.random()*a.length)] }
function fullName(){ return `${rp(FIRST)} ${rp(LAST)}`; }

function seedPeople(count=140){
  const used = new Set(); const arr=[];
  while(arr.length < count){
    const name = fullName(); if(used.has(name)) continue; used.add(name);
    const s1=rp(SKILLS); let s2=rp(SKILLS); if(s2===s1) s2=rp(SKILLS);
        const id = `f-${arr.length+1}`;
    const gender = guessGenderFromFirstName(name);

    arr.push({
      id,
      name,
      gender,
      avatarUrl: pickStableAvatar(gender, id + "-" + name),

      school: rp(SCHOOLS),
      role: rp(ROLES),
      skills:[s1,s2],
      affinity: rp(AFFIN),
      bio: rp(BIOS),
      city: rp(["Miami, FL","Washington, DC","Atlanta, GA","Baltimore, MD","Greensboro, NC","Tallahassee, FL","New York, NY","Charlotte, NC"])
    });

  }
  return arr;
}

/* Feed seeds */
const seedPosts = (() => {
  const base = [
    {id:"p1", author:"Jasmine B. (Howard)",   audience:"all",    text:"Won 1st place at the campus pitch night with a wearable asthma monitor! 🎉", likes:12, comments:[]},
    {id:"p2", author:"Andre M. (NC A&T)",     audience:"campus", text:"What if campus shuttles used computer vision to optimize routes in real time?", likes:7, comments:[{by:"Maya", text:"Pair that with rider heatmaps and it's 🔥"}]},
    {id:"p3", author:"Sanaa K. (Spelman)",    audience:"all",    text:"Summer internship: Product Design @ startup tackling maternal health outcomes. DM for details.", likes:18, comments:[]},
    {id:"p4", author:"Liam C. (Stanford)",    audience:"campus", text:"Study sync tonight 7pm — Algorithms II review. Library 3rd floor.", likes:3, comments:[]},
    {id:"p5", author:"Imani D. (MIT)",        audience:"all",    text:"Prototype demo clip from our AR campus tour.", media:{type:"video", url:"https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"}, likes:9, comments:[]},
    {id:"p6", author:"Kwame O. (NC A&T)",     audience:"all",    text:"We launched our landing page for Clean Dorms! 🚿⚡", link:"https://example.org/clean-dorms", likes:5, comments:[]}
  ];
  for(let i=0;i<16;i++){
    base.push({
      id:`pX${i}`,
      author:`${rp(FIRST)} ${rp(LAST)} (${rp(["Howard","NC A&T","Spelman","FAMU","MIT","Stanford"])})`,
      audience: rp(["all","campus"]),
      text: rp([
        "Demo of our AR campus tour is live! 🎧📍",
        "Looking for teammates for a weekend hack — DM me.",
        "Open office hours for freshmen interested in product.",
        "What if dorm rooftops became community gardens?",
        "Shoutout to everyone who came to last night's study sync!",
        "Posting my slides on inclusive venture design later today.",
        "We just passed 100 beta signups. Thank you, fam!",
        "Would anyone join a weekly 30-min accountability standup?"
      ]),
      likes: Math.floor(Math.random()*25),
      comments:[]
    });
  }
  return base;
})();

seedPosts.forEach((p, index) => {
  if (!p.location){
    p.location = [
      "Miami, FL",
      "Washington, DC",
      "Atlanta, GA",
      "Baltimore, MD",
      "Greensboro, NC",
      "Tallahassee, FL"
    ][index % 6];
  }
});

function futureISO(days, hour){
  const d=new Date(); d.setDate(d.getDate()+days); d.setHours(hour,0,0,0);
  const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,16);
}
const seedEvents = [
  {id:"e1", title:"Innovation Study Sync",           datetime:futureISO(2,18),  location:"Library C204",        host:"NSAAI A&T",  desc:"Data Structures problem set lab.", rsvps:24, checkins:8},
  {id:"e2", title:"Campus Hackathon",                datetime:futureISO(10,10), location:"Student Center",       host:"Innovation Council", desc:"48hrs. Teams form on site. Beginners welcome!", rsvps:73, checkins:0},
  {id:"e3", title:"Founder Fireside: From Idea to Seed", datetime:futureISO(5,19),  location:"Auditorium / Zoom", host:"NSAAI Howard", desc:"Q&A with a Black founder who raised $2.4M.", rsvps:41, checkins:0},
  {id:"e4", title:"Pitch Practice Circle",           datetime:futureISO(7,17),  location:"Maker Lab 101",       host:"NSAAI Spelman", desc:"Bring a 60-sec pitch. Friendly feedback!", rsvps:16, checkins:0},
  {id:"e5", title:"Clean Energy Lab Tour",           datetime:futureISO(12,14), location:"Engineering Hall",     host:"College of Eng.", desc:"See student-run solar projects in action.", rsvps:22, checkins:0},
  {id:"e6", title:"Late Night Code & Pizza",         datetime:futureISO(3,21),  location:"CS Lab 204",          host:"NSAAI NCAT", desc:"Casual coding night with snacks and good music.", rsvps:30, checkins:0},
  {id:"e7", title:"Scholarship Application Sprint",  datetime:futureISO(4,16),  location:"Career Center",       host:"Financial Aid + NSAAI", desc:"Work through scholarship apps together with peer support.", rsvps:28, checkins:0},
  {id:"e8", title:"Wellness Walk & Talks",           datetime:futureISO(6,9),   location:"Campus Quad",         host:"NSAAI Wellness Circle", desc:"Walk, talk, and reflect on the semester.", rsvps:18, checkins:0}
];

const seedJobs = [
  {id:"job-1", title:"Google Student Internships", org:"Google", location:"USA / Remote varies", type:"Internship", focus:"Tech, UX, business, AI, product", url:"https://careers.google.com/students/", bio:"A strong opportunity hub for students interested in software, UX, product, business, AI, and early-career innovation roles."},
  {id:"job-2", title:"Google STEP Internship", org:"Google", location:"USA", type:"Internship", focus:"Computer Science", url:"https://careers.google.com/jobs/results/?q=STEP%20Intern", bio:"Early computer science internship designed for underclassmen building technical confidence and real-world software experience."},
  {id:"job-3", title:"Google BOLD Internship", org:"Google", location:"USA", type:"Internship", focus:"Business, sales, marketing, finance, people operations", url:"https://careers.google.com/students/business-jobs/", bio:"Business-focused internship for students interested in operations, marketing, sales, finance, strategy, and people-centered innovation."},
  {id:"job-4", title:"Meta University", org:"Meta", location:"USA", type:"Internship", focus:"Software, product, analytics", url:"https://www.metacareers.com/careerprograms/students", bio:"Early talent program for students interested in product thinking, engineering, technology, and social platform innovation."},
  {id:"job-5", title:"Meta AI Research Internship", org:"Meta", location:"USA", type:"Internship", focus:"AI, machine learning, generative AI research", url:"https://www.metacareers.com/careerprograms/research", bio:"Research internship pathway for innovators interested in artificial intelligence, machine learning, large-scale systems, and applied research."},
  {id:"job-6", title:"Microsoft Explore Internship", org:"Microsoft", location:"USA", type:"Internship", focus:"Software engineering, product management", url:"https://careers.microsoft.com/students/us/en/usexploremicrosoftprogram", bio:"Great first or second-year internship for students exploring software engineering and product development."},
  {id:"job-7", title:"Microsoft Software Engineering Internship", org:"Microsoft", location:"USA", type:"Internship", focus:"Software, cloud, AI, developer tools", url:"https://careers.microsoft.com/students/us/en", bio:"Hands-on technical internship for students who want to build software products at global scale."},
  {id:"job-8", title:"Microsoft Research Undergraduate Internship", org:"Microsoft Research", location:"USA", type:"Internship", focus:"Research, computing, program management", url:"https://www.microsoft.com/en-us/research/academic-program/undergraduate-research-internship-computing/", bio:"Research-centered internship for students who want to explore computing, research engineering, and future-facing technology."},
  {id:"job-9", title:"Microsoft Data Science Summer School", org:"Microsoft Research", location:"New York, NY", type:"Program", focus:"Data science, research, analytics", url:"https://www.microsoft.com/en-us/research/academic-program/data-science-summer-school/", bio:"An intensive data science program for students interested in analytics, machine learning, research, and applied problem solving."},
  {id:"job-10", title:"Amazon SDE Internship", org:"Amazon", location:"USA", type:"Internship", focus:"Software engineering, cloud, systems", url:"https://amazon.jobs/content/en/career-programs/university/sde", bio:"High-impact software internship for students interested in building scalable products, cloud tools, and customer-facing systems."},

  {id:"job-11", title:"Amazon Science Internship", org:"Amazon", location:"USA", type:"Internship", focus:"AI, ML, robotics, research", url:"https://amazon.jobs/content/en/career-programs/university/science", bio:"Research and applied science internship for innovators interested in AI, machine learning, logistics, robotics, and experimentation."},
  {id:"job-12", title:"Amazon Operations Internship", org:"Amazon", location:"USA", type:"Internship", focus:"Operations, logistics, leadership", url:"https://amazon.jobs/content/en/career-programs/university-ops/na-students-internship", bio:"Leadership internship for students interested in operations, supply chain, management, and real-world execution."},
  {id:"job-13", title:"Amazon University Talent", org:"Amazon", location:"USA", type:"Internship / Early Career", focus:"Tech, business, operations", url:"https://amazon.jobs/content/en/career-programs/university", bio:"University recruiting hub with internships and graduate roles across software, operations, business, and innovation."},
  {id:"job-14", title:"Apple Internships", org:"Apple", location:"USA", type:"Internship", focus:"Hardware, software, design, business", url:"https://jobs.apple.com/en-us/search?team=internships-STDNT-INTRN", bio:"Premium internship pathway for students interested in design, hardware, software, product, operations, and creative technology."},
  {id:"job-15", title:"NVIDIA Internships", org:"NVIDIA", location:"USA", type:"Internship", focus:"AI, GPU, robotics, research", url:"https://www.nvidia.com/en-us/about-nvidia/careers/university-recruiting/", bio:"Elite technical internships for students interested in AI, accelerated computing, graphics, robotics, and future hardware."},
  {id:"job-16", title:"Tesla Internship Program", org:"Tesla", location:"USA", type:"Internship", focus:"EVs, energy, manufacturing, software", url:"https://www.tesla.com/careers/internships", bio:"Fast-paced innovation internship for students interested in electric vehicles, sustainability, battery systems, manufacturing, and software."},
  {id:"job-17", title:"SpaceX Internships", org:"SpaceX", location:"USA", type:"Internship", focus:"Aerospace, engineering, software", url:"https://www.spacex.com/internships/", bio:"Aerospace internship for students who want to work on rockets, space systems, engineering, and mission-driven technology."},
  {id:"job-18", title:"NASA Internships", org:"NASA", location:"USA", type:"Internship", focus:"STEM, space, research, engineering", url:"https://intern.nasa.gov/", bio:"STEM internship pathway for students interested in space exploration, engineering, science, data, and research."},
  {id:"job-19", title:"NASA OSTEM Internship", org:"NASA", location:"USA", type:"Internship", focus:"Space, science, research, engineering", url:"https://www.nasa.gov/learning-resources/internship-programs/", bio:"NASA student opportunity for innovators interested in space, engineering research, mission support, and scientific discovery."},
  {id:"job-20", title:"Boeing Internships", org:"Boeing", location:"USA", type:"Internship", focus:"Engineering, IT, data, business", url:"https://jobs.boeing.com/internships", bio:"Aerospace and defense internship for students interested in aircraft, space, manufacturing, systems, and innovation."},

  {id:"job-21", title:"Lockheed Martin Internships", org:"Lockheed Martin", location:"USA", type:"Internship", focus:"Aerospace, defense, cyber, engineering", url:"https://www.lockheedmartinjobs.com/college-students", bio:"STEM and defense internship pathway for students interested in aerospace, cybersecurity, engineering, and mission systems."},
  {id:"job-22", title:"Northrop Grumman Internships", org:"Northrop Grumman", location:"USA", type:"Internship", focus:"Defense, space, cyber, engineering", url:"https://www.northropgrumman.com/jobs/internships", bio:"Career-building opportunity for students interested in space, defense systems, environmental engineering, cyber, and advanced technology."},
  {id:"job-23", title:"RTX Internships", org:"RTX", location:"USA", type:"Internship / Co-op", focus:"Aerospace, defense, systems, software", url:"https://careers.rtx.com/global/en/internships-co-ops", bio:"Internship and co-op opportunities across aerospace, propulsion, defense, systems engineering, and software."},
  {id:"job-24", title:"General Motors Internships", org:"General Motors", location:"USA", type:"Internship", focus:"EV, software, manufacturing, design", url:"https://search-careers.gm.com/en/students/", bio:"Mobility and vehicle innovation opportunity for students interested in EVs, software, design, manufacturing, and sustainability."},
  {id:"job-25", title:"Ford College Careers", org:"Ford", location:"USA", type:"Internship / Early Career", focus:"EV, mobility, engineering, business", url:"https://corporate.ford.com/careers/students.html", bio:"Student opportunities in mobility, manufacturing, business, software, design, and future transportation."},
  {id:"job-26", title:"Rivian Internships", org:"Rivian", location:"USA", type:"Internship / Early Career", focus:"EV, sustainability, product, engineering", url:"https://careers.rivian.com/careers-home/jobs", bio:"Electric vehicle and sustainability career pathway for innovators interested in adventure, climate, design, and engineering."},
  {id:"job-27", title:"IBM Internships", org:"IBM", location:"USA", type:"Internship", focus:"AI, consulting, cloud, research", url:"https://www.ibm.com/careers/internships", bio:"Internships across AI, hybrid cloud, consulting, cybersecurity, research, and enterprise technology."},
  {id:"job-28", title:"IBM Entry-Level Careers", org:"IBM", location:"USA", type:"Entry-Level Job", focus:"Tech, consulting, data, design", url:"https://www.ibm.com/careers/entry-level", bio:"Early-career roles for graduates interested in consulting, software, data, AI, infrastructure, and client innovation."},
  {id:"job-29", title:"Salesforce Futureforce", org:"Salesforce", location:"USA", type:"Internship / Early Career", focus:"Software, sales, product, design", url:"https://www.salesforce.com/company/careers/university-recruiting/", bio:"Student and graduate opportunities in cloud software, AI, sales, product, marketing, and business technology."},
  {id:"job-30", title:"Adobe Internships", org:"Adobe", location:"USA", type:"Internship", focus:"Creative tech, design, AI, product", url:"https://careers.adobe.com/us/en/university", bio:"Creative technology internship for students interested in digital media, design, AI, product, engineering, and marketing."},

  {id:"job-31", title:"Oracle Internships", org:"Oracle", location:"USA", type:"Internship / Early Career", focus:"Cloud, software, data, business", url:"https://www.oracle.com/corporate/careers/students-grads/", bio:"Student and graduate roles across cloud infrastructure, enterprise software, consulting, data, and business systems."},
  {id:"job-32", title:"Intel Internships", org:"Intel", location:"USA", type:"Internship", focus:"Chips, AI, hardware, software", url:"https://www.intel.com/content/www/us/en/jobs/life-at-intel/students.html", bio:"Hardware and software internship pathway for students interested in semiconductors, AI, chips, systems, and manufacturing."},
  {id:"job-33", title:"AMD Internships", org:"AMD", location:"USA", type:"Internship", focus:"Semiconductors, AI chips, engineering", url:"https://www.amd.com/en/corporate/careers/students.html", bio:"Technical internships for students interested in chips, high-performance computing, AI processors, and hardware engineering."},
  {id:"job-34", title:"Qualcomm Internships", org:"Qualcomm", location:"USA", type:"Internship", focus:"Wireless, AI, chips, robotics", url:"https://www.qualcomm.com/company/careers/students", bio:"Student opportunities in wireless technology, mobile chips, AI, robotics, hardware, and connected systems."},
  {id:"job-35", title:"Dell Internships", org:"Dell Technologies", location:"USA", type:"Internship", focus:"Tech, product, sales, engineering", url:"https://jobs.dell.com/en/internships", bio:"Technology internship pathway across product, engineering, sales, operations, services, and enterprise infrastructure."},
  {id:"job-36", title:"Cisco University Careers", org:"Cisco", location:"USA", type:"Internship / Early Career", focus:"Networking, cybersecurity, cloud", url:"https://jobs.cisco.com/jobs/ProjectList/University-Jobs/1443", bio:"University roles for students interested in networking, cybersecurity, collaboration tools, cloud, and infrastructure."},
  {id:"job-37", title:"ServiceNow Early Careers", org:"ServiceNow", location:"USA", type:"Internship / Early Career", focus:"AI workflow, product, software", url:"https://careers.servicenow.com/early-careers", bio:"Opportunities for students interested in workflow automation, enterprise AI, software, product, and customer success."},
  {id:"job-38", title:"Workday Internships", org:"Workday", location:"USA", type:"Internship / Early Career", focus:"Product, cloud, HR tech, data", url:"https://workday.wd5.myworkdayjobs.com/Workday", bio:"Technology and business opportunities in cloud software, people systems, analytics, and enterprise product development."},
  {id:"job-39", title:"Uber University Careers", org:"Uber", location:"USA", type:"Internship / Early Career", focus:"Mobility, software, product, operations", url:"https://www.uber.com/us/en/careers/university/", bio:"Student roles across mobility, logistics, product, engineering, data, operations, and marketplace technology."},
  {id:"job-40", title:"Lyft Early Talent", org:"Lyft", location:"USA", type:"Internship / Early Career", focus:"Software, product, data, operations", url:"https://www.lyft.com/careers/university", bio:"Early talent pathway for students interested in transportation technology, data, software, product, and marketplace operations."},

  {id:"job-41", title:"Airbnb Internships", org:"Airbnb", location:"USA", type:"Internship", focus:"Product, design, software, data", url:"https://careers.airbnb.com/university/", bio:"Product-centered internship opportunities for students interested in travel, marketplace design, software, and community-driven technology."},
  {id:"job-42", title:"Spotify Internships", org:"Spotify", location:"USA / Remote varies", type:"Internship", focus:"Music tech, product, data, design", url:"https://www.lifeatspotify.com/students", bio:"Creative tech internships for students interested in music, culture, product, data, engineering, design, and creator platforms."},
  {id:"job-43", title:"Netflix Intern Program", org:"Netflix", location:"USA", type:"Internship", focus:"Entertainment tech, data, product", url:"https://jobs.netflix.com/intern-program", bio:"Entertainment technology internship for innovators interested in streaming, storytelling, data, engineering, and media platforms."},
  {id:"job-44", title:"Disney Internships", org:"Disney", location:"USA", type:"Internship", focus:"Media, Imagineering, business, tech", url:"https://sites.disney.com/lifeatdisney/students-recent-grads/", bio:"Student opportunities across media, parks, entertainment, business, technology, storytelling, and Imagineering."},
  {id:"job-45", title:"Warner Bros. Discovery Internships", org:"Warner Bros. Discovery", location:"USA", type:"Internship / Early Career", focus:"Film, media, tech, marketing", url:"https://careers.wbd.com/global/en/internships-early-careers", bio:"Media and entertainment opportunities in content, streaming, marketing, production, business, and technology."},
  {id:"job-46", title:"NBCUniversal Internships", org:"NBCUniversal", location:"USA", type:"Internship", focus:"Media, journalism, tech, entertainment", url:"https://www.nbcunicareers.com/internships", bio:"Internships across journalism, entertainment, sports, streaming, production, marketing, and technology."},
  {id:"job-47", title:"Paramount Internships", org:"Paramount", location:"USA", type:"Internship", focus:"Media, sports, streaming, marketing", url:"https://www.paramount.com/careers/internships", bio:"Internships for students interested in content, media brands, streaming, sports, marketing, and entertainment business."},
  {id:"job-48", title:"Nike Internships", org:"Nike", location:"USA", type:"Internship", focus:"Brand, design, tech, sports innovation", url:"https://jobs.nike.com/internships", bio:"Sports innovation internship for students interested in design, brand, product, technology, culture, and athletics."},
  {id:"job-49", title:"Adidas Early Careers", org:"Adidas", location:"USA", type:"Internship / Early Career", focus:"Product, sports, marketing, design", url:"https://careers.adidas-group.com/teams/students", bio:"Student opportunities for innovators interested in sportswear, brand strategy, product, design, and culture."},
  {id:"job-50", title:"L’Oréal USA Internships", org:"L’Oréal", location:"USA", type:"Internship", focus:"Beauty, brand, tech, product", url:"https://careers.loreal.com/en_US/content/Students-and-Graduates/", bio:"Beauty and brand innovation internships across marketing, product, data, operations, supply chain, and technology."},

  {id:"job-51", title:"JPMorganChase Fellowship", org:"JPMorganChase", location:"USA", type:"Fellowship", focus:"Finance, leadership, early exposure", url:"https://careers.jpmorgan.com/us/en/students/programs/ahl-fellowship", bio:"Paid fellowship with early exposure to finance, professional development, and career pathways for underrepresented talent."},
  {id:"job-52", title:"JPMorganChase Software Engineer Internship", org:"JPMorganChase", location:"USA", type:"Internship", focus:"Finance tech, software, data", url:"https://careers.jpmorgan.com/us/en/students/programs/software-engineer-summer", bio:"Fintech software internship for students interested in engineering, financial systems, data, cloud, and secure products."},
  {id:"job-53", title:"JPMorganChase Investment Banking Internship", org:"JPMorganChase", location:"USA", type:"Internship", focus:"Finance, deals, capital markets", url:"https://careers.jpmorgan.com/us/en/students/programs/investment-banking-summer-analyst", bio:"Finance internship for students interested in banking, deals, markets, corporate strategy, and financial leadership."},
  {id:"job-54", title:"Goldman Sachs Summer Analyst", org:"Goldman Sachs", location:"USA", type:"Internship", focus:"Finance, engineering, data, investing", url:"https://www.goldmansachs.com/careers/students/programs/americas/summer-analyst-program", bio:"Highly competitive analyst internship across finance, engineering, investing, risk, operations, and strategy."},
  {id:"job-55", title:"Morgan Stanley Summer Analyst", org:"Morgan Stanley", location:"USA", type:"Internship", focus:"Finance, tech, wealth, research", url:"https://www.morganstanley.com/people-opportunities/students-graduates/programs", bio:"Finance and business internship pathway across wealth management, banking, research, operations, and technology."},
  {id:"job-56", title:"Bank of America Campus Careers", org:"Bank of America", location:"USA", type:"Internship / Early Career", focus:"Finance, tech, business, analyst roles", url:"https://careers.bankofamerica.com/en-us/students", bio:"Campus career hub for students interested in banking, markets, software, analytics, operations, and business leadership."},
  {id:"job-57", title:"Capital One Internships", org:"Capital One", location:"USA", type:"Internship", focus:"Tech, product, finance, analytics", url:"https://www.capitalonecareers.com/students", bio:"Internships for students interested in fintech, software engineering, product, data, analytics, and business strategy."},
  {id:"job-58", title:"BlackRock Summer Internship", org:"BlackRock", location:"USA", type:"Internship", focus:"Investing, tech, analytics, operations", url:"https://careers.blackrock.com/students-and-graduates-americas", bio:"Investment and technology internship for students interested in asset management, analytics, software, operations, and markets."},
  {id:"job-59", title:"Citi Early Career Programs", org:"Citi", location:"USA", type:"Internship / Early Career", focus:"Banking, tech, risk, analytics", url:"https://jobs.citi.com/students-and-graduates", bio:"Student and graduate opportunities across banking, technology, risk, analytics, markets, and operations."},
  {id:"job-60", title:"Wells Fargo Internships", org:"Wells Fargo", location:"USA", type:"Internship / Early Career", focus:"Banking, tech, finance, operations", url:"https://www.wellsfargojobs.com/en/early-careers/", bio:"Early career opportunities across finance, technology, operations, risk, and client services."},

  {id:"job-61", title:"Mastercard Internships", org:"Mastercard", location:"USA", type:"Internship", focus:"Payments, cyber, data, product", url:"https://careers.mastercard.com/us/en/internships", bio:"Payments innovation internships for students interested in fintech, cybersecurity, analytics, product, and digital commerce."},
  {id:"job-62", title:"Visa Internships", org:"Visa", location:"USA", type:"Internship", focus:"Payments, fintech, security, product", url:"https://usa.visa.com/careers/university-recruiting.html", bio:"University recruiting pathway for students interested in digital payments, cybersecurity, product, technology, and global commerce."},
  {id:"job-63", title:"PayPal Internships", org:"PayPal", location:"USA", type:"Internship / Early Career", focus:"Fintech, software, product, data", url:"https://paypal.eightfold.ai/careers", bio:"Fintech opportunity for students interested in payments, software, product, fraud prevention, data, and financial inclusion."},
  {id:"job-64", title:"Stripe Internships", org:"Stripe", location:"USA", type:"Internship / Early Career", focus:"Fintech, engineering, product", url:"https://stripe.com/jobs/search?teams=University", bio:"University roles for builders interested in payments infrastructure, software engineering, product, and internet commerce."},
  {id:"job-65", title:"Coinbase Internships", org:"Coinbase", location:"USA / Remote varies", type:"Internship / Early Career", focus:"Crypto, fintech, software, security", url:"https://www.coinbase.com/careers/students", bio:"Student roles for innovators interested in crypto, blockchain, fintech, security, software, and decentralized systems."},
  {id:"job-66", title:"INROADS Internships", org:"INROADS", location:"USA", type:"Internship Program", focus:"Corporate internships for underrepresented talent", url:"https://inroads.org/internships/", bio:"Career development and internship access program connecting underrepresented students with corporate opportunities."},
  {id:"job-67", title:"Management Leadership for Tomorrow Career Prep", org:"MLT", location:"USA", type:"Career Program", focus:"Career prep, internships, leadership", url:"https://mlt.org/career-prep/", bio:"Career acceleration program helping underrepresented students access top internships, coaching, and professional networks."},
  {id:"job-68", title:"SEO Career Internship Program", org:"SEO", location:"USA", type:"Career Program", focus:"Finance, tech, consulting access", url:"https://www.seo-usa.org/career/", bio:"Professional development and internship access program connecting students to competitive careers in finance, consulting, and tech."},
  {id:"job-69", title:"Code2040 Fellows", org:"Code2040", location:"USA", type:"Fellowship", focus:"Black and Latinx tech career access", url:"https://www.code2040.org/", bio:"Community and fellowship pathway focused on increasing Black and Latinx representation in technology."},
  {id:"job-70", title:"ColorStack Opportunities", org:"ColorStack", location:"USA", type:"Career Community", focus:"Black and Latinx CS students", url:"https://www.colorstack.org/", bio:"Community and career platform supporting Black and Latinx computer science students with opportunities, events, and networks."},

  {id:"job-71", title:"Rewriting the Code", org:"Rewriting the Code", location:"USA", type:"Career Community", focus:"Women in tech internships and community", url:"https://rewritingthecode.org/", bio:"Career community connecting women in tech to internships, mentorship, peer support, and professional development."},
  {id:"job-72", title:"HBCU First Fellowship", org:"HBCU First", location:"USA / Remote", type:"Fellowship", focus:"HBCU leadership and career development", url:"https://hbcufirst.com/fellowship", bio:"Fellowship experience built to help HBCU students grow leadership, career readiness, and professional confidence."},
  {id:"job-73", title:"TMCF Internships", org:"Thurgood Marshall College Fund", location:"USA", type:"Internship Program", focus:"HBCU internships and corporate programs", url:"https://www.tmcf.org/students-alumni/internships/", bio:"Internship and career program hub connecting HBCU students to corporate, government, and leadership opportunities."},
  {id:"job-74", title:"UNCF Internships", org:"UNCF", location:"USA", type:"Internship Program", focus:"Internships, scholarships, career programs", url:"https://uncf.org/internships", bio:"Opportunity hub for Black students seeking internships, career programs, scholarships, and professional development."},
  {id:"job-75", title:"HBCU Sustainable Communities Internship", org:"HBCU Sustainable Communities Initiative", location:"USA", type:"Internship", focus:"Sustainability, community, career coaching", url:"https://hbcusci.org/internships/", bio:"Sustainability-centered internship helping students explore climate, communities, equity, environmental justice, and career development."},
  {id:"job-76", title:"DoN HBCU/MI Internship", org:"Department of Navy", location:"USA", type:"Internship", focus:"Navy research for HBCU/MSI STEM students", url:"https://www.hbcumi-sip.com/", bio:"STEM research internship for HBCU and minority-serving institution students interested in Navy science and engineering."},
  {id:"job-77", title:"NAVAIR HBCU/MI Internship", org:"NAVAIR / Office of Naval Research", location:"USA", type:"Internship", focus:"Naval aviation STEM research", url:"https://www.onr.navy.mil/hbcu", bio:"Research and technical pathway for students interested in naval aviation, defense technology, engineering, and STEM research."},
  {id:"job-78", title:"DOE Internships & Fellowships", org:"U.S. Department of Energy", location:"USA", type:"Internship / Fellowship", focus:"Energy, climate, STEM, national security", url:"https://www.energy.gov/internships-fellowships", bio:"Federal opportunity hub for students interested in clean energy, climate, national labs, engineering, and science."},
  {id:"job-79", title:"ORISE Internships", org:"ORISE", location:"USA", type:"Internship / Fellowship", focus:"STEM research with federal agencies", url:"https://orise.orau.gov/internships-fellowships/", bio:"Research internships and fellowships with federal agencies in STEM, health, environment, energy, and technology."},
  {id:"job-80", title:"NSF REU", org:"National Science Foundation", location:"USA", type:"Research Program", focus:"Paid undergraduate research", url:"https://www.nsf.gov/crssprgm/reu/", bio:"Paid research experiences for undergraduates interested in science, engineering, computing, and academic research."},

  {id:"job-81", title:"NIH Summer Internship Program", org:"National Institutes of Health", location:"USA", type:"Internship", focus:"Biomedical, data, health research", url:"https://www.training.nih.gov/research-training/pb/sip/", bio:"Biomedical research internship for students interested in medicine, biology, health, data, labs, and scientific discovery."},
  {id:"job-82", title:"CDC Student Internships", org:"Centers for Disease Control and Prevention", location:"USA", type:"Internship", focus:"Public health, data, science", url:"https://jobs.cdc.gov/working-at-cdc/student-intern-jobs.html", bio:"Public health opportunities for students interested in disease prevention, data, health equity, science, and emergency response."},
  {id:"job-83", title:"EPA Student Internships", org:"Environmental Protection Agency", location:"USA", type:"Internship", focus:"Environment, climate, policy, science", url:"https://www.epa.gov/careers/student-internships", bio:"Environmental internship pathway for students interested in climate, environmental justice, science, regulation, and policy."},
  {id:"job-84", title:"U.S. State Department Student Internship", org:"U.S. Department of State", location:"USA / Abroad", type:"Internship", focus:"Diplomacy, policy, global affairs", url:"https://careers.state.gov/interns-fellows/student-internship-program/", bio:"Public service internship for students interested in diplomacy, international affairs, policy, culture, and global leadership."},
  {id:"job-85", title:"White House Internship Program", org:"The White House", location:"Washington, DC", type:"Internship", focus:"Public service, policy, leadership", url:"https://www.whitehouse.gov/get-involved/internships/", bio:"Public service internship for students and early-career leaders interested in policy, civic leadership, and government operations."},
  {id:"job-86", title:"Pathways Internship Program", org:"USAJOBS / Federal Government", location:"USA", type:"Internship / Early Career", focus:"Federal internships across agencies", url:"https://www.usajobs.gov/Help/working-in-government/unique-hiring-paths/students/", bio:"Federal government pathway for students and recent graduates seeking internships and early-career roles across agencies."},
  {id:"job-87", title:"Smithsonian Internships", org:"Smithsonian Institution", location:"USA", type:"Internship", focus:"Culture, museums, research, media", url:"https://internships.si.edu/", bio:"Internship opportunities in museums, archives, science, history, culture, storytelling, and research."},
  {id:"job-88", title:"Library of Congress Internships", org:"Library of Congress", location:"Washington, DC", type:"Internship / Fellowship", focus:"Archives, research, tech, culture", url:"https://www.loc.gov/internships-and-fellowships/", bio:"Opportunities for students interested in archives, research, technology, history, culture, law, and public knowledge."},
  {id:"job-89", title:"National Geographic Internships", org:"National Geographic", location:"USA", type:"Internship", focus:"Storytelling, science, media, exploration", url:"https://www.nationalgeographic.org/careers/internships/", bio:"Opportunity for innovators interested in exploration, storytelling, science, geography, education, and media."},
  {id:"job-90", title:"Bloomberg Internships", org:"Bloomberg", location:"USA", type:"Internship", focus:"Data, journalism, finance, engineering", url:"https://www.bloomberg.com/company/careers/working-here/students/", bio:"Internships across financial data, engineering, journalism, analytics, media, and business technology."},

  {id:"job-91", title:"McKinsey Internship Programs", org:"McKinsey & Company", location:"USA", type:"Internship / Early Career", focus:"Consulting, analytics, strategy", url:"https://www.mckinsey.com/careers/students", bio:"Consulting and strategy pathway for students interested in problem-solving, business transformation, data, and leadership."},
  {id:"job-92", title:"BCG Internships", org:"Boston Consulting Group", location:"USA", type:"Internship / Early Career", focus:"Consulting, strategy, digital ventures", url:"https://careers.bcg.com/students", bio:"Strategy consulting opportunity for students interested in business, innovation, digital transformation, and leadership."},
  {id:"job-93", title:"Bain Associate Consultant Intern", org:"Bain & Company", location:"USA", type:"Internship", focus:"Strategy consulting", url:"https://www.bain.com/careers/roles/associate-consultant-intern/", bio:"Consulting internship for students interested in strategy, analytics, client work, leadership, and business problem-solving."},
  {id:"job-94", title:"Deloitte Internships", org:"Deloitte", location:"USA", type:"Internship", focus:"Consulting, tech, audit, strategy", url:"https://www2.deloitte.com/us/en/pages/careers/articles/join-deloitte-internships.html", bio:"Professional services internships across consulting, technology, audit, tax, strategy, and business transformation."},
  {id:"job-95", title:"Accenture Internships", org:"Accenture", location:"USA", type:"Internship / Early Career", focus:"Consulting, tech, AI, strategy", url:"https://www.accenture.com/us-en/careers/local/students", bio:"Internships for students interested in technology consulting, AI, strategy, digital transformation, and innovation."},
  {id:"job-96", title:"PwC Internships", org:"PwC", location:"USA", type:"Internship", focus:"Consulting, accounting, tech, deals", url:"https://www.pwc.com/us/en/careers/entry-level/internships.html", bio:"Internship pathway across consulting, assurance, tax, deals, cybersecurity, technology, and business services."},
  {id:"job-97", title:"EY Internships", org:"EY", location:"USA", type:"Internship / Early Career", focus:"Consulting, assurance, tax, tech", url:"https://www.ey.com/en_us/careers/students", bio:"Student opportunities across consulting, assurance, tax, strategy, technology, and entrepreneurship."},
  {id:"job-98", title:"KPMG Internships", org:"KPMG", location:"USA", type:"Internship / Early Career", focus:"Audit, advisory, tax, tech", url:"https://kpmg.com/us/en/careers/students.html", bio:"Professional services internships across audit, advisory, tax, technology, risk, and business transformation."},
  {id:"job-99", title:"Universal Orlando Internships", org:"Universal Orlando Resort", location:"Orlando, FL", type:"Internship", focus:"GIS, innovation, creative operations", url:"https://jobs.universalparks.com/universal-orlando-resort/search-jobs/internship", bio:"Creative and operations internships for students interested in entertainment, GIS, attractions, media, technology, and guest experience."},
  {id:"job-100", title:"SAP iXp Internships", org:"SAP", location:"USA", type:"Internship", focus:"Enterprise software, AI, product, business", url:"https://jobs.sap.com/content/iXp/", bio:"Global internship program for students interested in enterprise software, AI, business systems, product, operations, and innovation."}
];

const seedCampuses = [
  {id:"campus-1", name:"University of Houston", state:"TX", program:"Wolff Center for Entrepreneurship", url:"https://www.bauer.uh.edu/wce/"},
  {id:"campus-2", name:"University of Texas at Austin", state:"TX", program:"Texas Innovation Center", url:"https://texasinnovationcenter.utexas.edu/"},
  {id:"campus-3", name:"Babson College", state:"MA", program:"Arthur M. Blank Center for Entrepreneurship", url:"https://www.babson.edu/academics/centers-and-institutes/arthur-m-blank-center-for-entrepreneurship/"},
  {id:"campus-4", name:"University of Michigan", state:"MI", program:"Center for Entrepreneurship", url:"https://cfe.umich.edu/"},
  {id:"campus-5", name:"University of Washington", state:"WA", program:"Buerk Center for Entrepreneurship", url:"https://foster.uw.edu/centers/buerk-ctr-entrepreneurship/"},
  {id:"campus-6", name:"Stanford University", state:"CA", program:"Stanford Technology Ventures Program", url:"https://stvp.stanford.edu/"},
  {id:"campus-7", name:"MIT", state:"MA", program:"Martin Trust Center for MIT Entrepreneurship", url:"https://entrepreneurship.mit.edu/"},
  {id:"campus-8", name:"Harvard University", state:"MA", program:"Harvard Innovation Labs", url:"https://innovationlabs.harvard.edu/"},
  {id:"campus-9", name:"Rice University", state:"TX", program:"Liu Idea Lab for Innovation & Entrepreneurship", url:"https://entrepreneurship.rice.edu/"},
  {id:"campus-10", name:"University of Pennsylvania", state:"PA", program:"Pennovation Center", url:"https://pennovation.upenn.edu/"},
  {id:"campus-11", name:"Cornell University", state:"NY", program:"eLab / Entrepreneurship at Cornell", url:"https://eship.cornell.edu/"},
  {id:"campus-12", name:"Columbia University", state:"NY", program:"Columbia Startup Lab", url:"https://entrepreneurship.columbia.edu/startup-lab/"},
  {id:"campus-13", name:"NYU", state:"NY", program:"Leslie eLab", url:"https://entrepreneur.nyu.edu/resource/leslie-elab/"},
  {id:"campus-14", name:"UC Berkeley", state:"CA", program:"Berkeley SkyDeck", url:"https://skydeck.berkeley.edu/"},
  {id:"campus-15", name:"UCLA", state:"CA", program:"Anderson Venture Accelerator", url:"https://www.anderson.ucla.edu/about/centers/price-center-for-entrepreneurship-and-innovation/anderson-venture-accelerator"},
  {id:"campus-16", name:"USC", state:"CA", program:"Lloyd Greif Center for Entrepreneurial Studies", url:"https://www.marshall.usc.edu/departments/lloyd-greif-center-entrepreneurial-studies"},
  {id:"campus-17", name:"Arizona State University", state:"AZ", program:"J. Orin Edson Entrepreneurship + Innovation Institute", url:"https://entrepreneurship.asu.edu/"},
  {id:"campus-18", name:"Georgia Tech", state:"GA", program:"CREATE-X", url:"https://create-x.gatech.edu/"},
  {id:"campus-19", name:"Duke University", state:"NC", program:"Duke Innovation & Entrepreneurship", url:"https://entrepreneurship.duke.edu/"},
  {id:"campus-20", name:"UNC Chapel Hill", state:"NC", program:"Innovate Carolina", url:"https://innovate.unc.edu/"},
  {id:"campus-21", name:"NC A&T State University", state:"NC", program:"Center of Excellence in Entrepreneurship and Innovation", url:"https://www.ncat.edu/cobe/centers/ceei/"},
  {id:"campus-22", name:"Howard University", state:"DC", program:"Howard University Innovation Center", url:"https://howard.edu/"},
  {id:"campus-23", name:"Bowie State University", state:"MD", program:"Entrepreneurship Innovation Center", url:"https://www.bowiestate.edu/academics/colleges/college-of-business/entrepreneurship-innovation-center/"},
  {id:"campus-24", name:"Florida A&M University", state:"FL", program:"FAMU SBI Entrepreneurship Programs", url:"https://sbi.famu.edu/"},
  {id:"campus-25", name:"Morehouse College", state:"GA", program:"Morehouse Innovation & Entrepreneurship Center", url:"https://miec.morehouse.edu/"},
  {id:"campus-26", name:"Spelman College", state:"GA", program:"Spelpreneur / Entrepreneurship Programs", url:"https://www.spelman.edu/"},
  {id:"campus-27", name:"Clark Atlanta University", state:"GA", program:"Center for Innovation and Entrepreneurial Development", url:"https://www.cau.edu/"},
  {id:"campus-28", name:"Hampton University", state:"VA", program:"Center for Entrepreneurship, Innovation and Economic Development", url:"https://home.hamptonu.edu/"},
  {id:"campus-29", name:"Norfolk State University", state:"VA", program:"Innovation Center / Entrepreneurship Programs", url:"https://www.nsu.edu/"},
  {id:"campus-30", name:"Morgan State University", state:"MD", program:"Entrepreneurial Development & Assistance Center", url:"https://www.morgan.edu/edac"},
  {id:"campus-31", name:"Prairie View A&M University", state:"TX", program:"Innovation Commercialization Entrepreneurship", url:"https://www.pvamu.edu/"},
  {id:"campus-32", name:"Southern University", state:"LA", program:"Innovation and Entrepreneurship Programs", url:"https://www.subr.edu/"},
  {id:"campus-33", name:"Tennessee State University", state:"TN", program:"Center for Entrepreneurship and Economic Development", url:"https://www.tnstate.edu/"},
  {id:"campus-34", name:"Tuskegee University", state:"AL", program:"Innovation / Entrepreneurship Programs", url:"https://www.tuskegee.edu/"},
  {id:"campus-35", name:"Alabama A&M University", state:"AL", program:"Entrepreneurship Center / HBCU Innovation", url:"https://www.aamu.edu/"},
  {id:"campus-36", name:"Jackson State University", state:"MS", program:"Center for Innovation and Entrepreneurship", url:"https://www.jsums.edu/"},
  {id:"campus-37", name:"North Carolina Central University", state:"NC", program:"Center for Entrepreneurship and Economic Development", url:"https://www.nccu.edu/"},
  {id:"campus-38", name:"Florida International University", state:"FL", program:"Business Innovation and Growth Accelerator", url:"https://business.fiu.edu/biz/business-innovation-and-growth-accelerator/"},
  {id:"campus-39", name:"University of Miami", state:"FL", program:"The Launch Pad", url:"https://innovation.miami.edu/about-us/thelaunchpad/index.html"},
  {id:"campus-40", name:"University of Florida", state:"FL", program:"Entrepreneurship & Innovation Center", url:"https://warrington.ufl.edu/entrepreneurship-and-innovation-center/"},
  {id:"campus-41", name:"UCF", state:"FL", program:"Blackstone LaunchPad", url:"https://cel.ucf.edu/blackstone-launchpad/"},
  {id:"campus-42", name:"Florida State University", state:"FL", program:"Jim Moran College of Entrepreneurship", url:"https://jimmorancollege.fsu.edu/"},
  {id:"campus-43", name:"University of Maryland", state:"MD", program:"Dingman Center for Entrepreneurship", url:"https://www.rhsmith.umd.edu/centers-initiatives/dingman-center-entrepreneurship"},
  {id:"campus-44", name:"George Washington University", state:"DC", program:"GW Office of Innovation & Entrepreneurship", url:"https://innovation.gwu.edu/"},
  {id:"campus-45", name:"Georgetown University", state:"DC", program:"Georgetown Entrepreneurship", url:"https://entrepreneurship.georgetown.edu/"},
  {id:"campus-46", name:"Johns Hopkins University", state:"MD", program:"FastForward U", url:"https://ventures.jhu.edu/programs-services/fastforward-u/"},
  {id:"campus-47", name:"Carnegie Mellon University", state:"PA", program:"Swartz Center for Entrepreneurship", url:"https://www.cmu.edu/swartz-center-for-entrepreneurship/"},
  {id:"campus-48", name:"Penn State", state:"PA", program:"Invent Penn State", url:"https://invent.psu.edu/"},
  {id:"campus-49", name:"Temple University", state:"PA", program:"Innovation & Entrepreneurship Institute", url:"https://www.fox.temple.edu/institutes-and-centers/innovation-and-entrepreneurship-institute/"},
  {id:"campus-50", name:"Drexel University", state:"PA", program:"Baiada Institute for Entrepreneurship", url:"https://drexel.edu/baiada/"},
  {id:"campus-51", name:"University of Virginia", state:"VA", program:"i.Lab at UVA", url:"https://ilab.virginia.edu/"},
  {id:"campus-52", name:"Virginia Tech", state:"VA", program:"Apex Center for Entrepreneurs", url:"https://apex.vt.edu/"},
  {id:"campus-53", name:"William & Mary", state:"VA", program:"Alan B. Miller Entrepreneurship Center", url:"https://millercenter.mason.wm.edu/"},
  {id:"campus-54", name:"NC State University", state:"NC", program:"Entrepreneurship Clinic / NC State Innovation", url:"https://entrepreneurship.ncsu.edu/"},
  {id:"campus-55", name:"UNC Charlotte", state:"NC", program:"Center for Entrepreneurship and Innovation", url:"https://entrepreneurship.charlotte.edu/"},
  {id:"campus-56", name:"Wake Forest University", state:"NC", program:"Center for Entrepreneurship", url:"https://entrepreneurship.wfu.edu/"},
  {id:"campus-57", name:"Clemson University", state:"SC", program:"Spiro Institute for Entrepreneurial Leadership", url:"https://www.clemson.edu/centers-institutes/spiro/"},
  {id:"campus-58", name:"University of South Carolina", state:"SC", program:"McNair Institute for Entrepreneurism", url:"https://sc.edu/study/colleges_schools/moore/research_and_centers/centers/mcnair/index.php"},
  {id:"campus-59", name:"Emory University", state:"GA", program:"The Hatchery", url:"https://hatchery.emory.edu/"},
  {id:"campus-60", name:"Georgia State University", state:"GA", program:"Entrepreneurship and Innovation Institute", url:"https://eni.gsu.edu/"},
  {id:"campus-61", name:"University of Alabama", state:"AL", program:"Alabama Entrepreneurship Institute", url:"https://entrepreneurship.ua.edu/"},
  {id:"campus-62", name:"Auburn University", state:"AL", program:"New Venture Accelerator", url:"https://harbert.auburn.edu/research-faculty/centers/new-venture-accelerator/"},
  {id:"campus-63", name:"Vanderbilt University", state:"TN", program:"The Wond’ry", url:"https://www.vanderbilt.edu/thewondry/"},
  {id:"campus-64", name:"University of Tennessee Knoxville", state:"TN", program:"Anderson Center for Entrepreneurship & Innovation", url:"https://haslam.utk.edu/anderson-center/"},
  {id:"campus-65", name:"University of Kentucky", state:"KY", program:"Von Allmen Center for Entrepreneurship", url:"https://gatton.uky.edu/faculty-research/research-centers/von-allmen-center-entrepreneurship"},
  {id:"campus-66", name:"University of Louisville", state:"KY", program:"Forcht Center for Entrepreneurship", url:"https://business.louisville.edu/centers/forcht-center-for-entrepreneurship/"},
  {id:"campus-67", name:"Ohio State University", state:"OH", program:"Keenan Center for Entrepreneurship", url:"https://keenan.osu.edu/"},
  {id:"campus-68", name:"University of Cincinnati", state:"OH", program:"1819 Innovation Hub / Venture Lab", url:"https://www.innovation.uc.edu/what-we-do/venture-lab.html"},
  {id:"campus-69", name:"Ohio University", state:"OH", program:"Innovation Center", url:"https://www.ohio.edu/entrepreneurship/innovation-center"},
  {id:"campus-70", name:"Case Western Reserve University", state:"OH", program:"Veale Institute for Entrepreneurship", url:"https://case.edu/entrepreneurship/"},
  {id:"campus-71", name:"Purdue University", state:"IN", program:"Burton D. Morgan Center for Entrepreneurship", url:"https://www.purdue.edu/discoverypark/bdmce/"},
  {id:"campus-72", name:"Indiana University", state:"IN", program:"Johnson Center for Entrepreneurship & Innovation", url:"https://kelley.iu.edu/faculty-research/centers-institutes/johnson-center/index.html"},
  {id:"campus-73", name:"University of Notre Dame", state:"IN", program:"IDEA Center", url:"https://ideacenter.nd.edu/"},
  {id:"campus-74", name:"University of Illinois Urbana-Champaign", state:"IL", program:"Origin Ventures Academy for Entrepreneurial Leadership", url:"https://giesbusiness.illinois.edu/experiential-learning/origin-ventures-academy"},
  {id:"campus-75", name:"Northwestern University", state:"IL", program:"The Garage", url:"https://thegarage.northwestern.edu/"},
  {id:"campus-76", name:"University of Chicago", state:"IL", program:"Polsky Center", url:"https://polsky.uchicago.edu/"},
  {id:"campus-77", name:"University of Wisconsin-Madison", state:"WI", program:"Weinert Center for Entrepreneurship", url:"https://business.wisc.edu/centers/weinert/"},
  {id:"campus-78", name:"Marquette University", state:"WI", program:"707 Hub", url:"https://www.marquette.edu/innovation/707-hub.php"},
  {id:"campus-79", name:"University of Minnesota", state:"MN", program:"Holmes Center for Entrepreneurship", url:"https://carlsonschool.umn.edu/faculty-research/holmes-center-entrepreneurship"},
  {id:"campus-80", name:"Washington University in St. Louis", state:"MO", program:"Skandalaris Center", url:"https://skandalaris.wustl.edu/"},
  {id:"campus-81", name:"University of Missouri", state:"MO", program:"Griggs Innovators Nexus", url:"https://griggs.missouri.edu/"},
  {id:"campus-82", name:"University of Kansas", state:"KS", program:"KU Innovation Park", url:"https://kuinnovationpark.com/"},
  {id:"campus-83", name:"University of Colorado Boulder", state:"CO", program:"Innovation & Entrepreneurship Initiative", url:"https://www.colorado.edu/innovate/"},
  {id:"campus-84", name:"University of Denver", state:"CO", program:"Entrepreneurship@DU", url:"https://daniels.du.edu/entrepreneurship/"},
  {id:"campus-85", name:"University of Arizona", state:"AZ", program:"Tech Launch Arizona", url:"https://techlaunch.arizona.edu/"},
  {id:"campus-86", name:"Grand Canyon University", state:"AZ", program:"Colangelo Center for Conscious Capitalism", url:"https://www.gcu.edu/colangelo-college-of-business/entrepreneurship"},
  {id:"campus-87", name:"University of Utah", state:"UT", program:"Lassonde Entrepreneur Institute", url:"https://lassonde.utah.edu/"},
  {id:"campus-88", name:"Brigham Young University", state:"UT", program:"Rollins Center for Technology & Entrepreneurship", url:"https://marriott.byu.edu/rollins/"},
  {id:"campus-89", name:"University of Nevada Las Vegas", state:"NV", program:"Troesh Center for Entrepreneurship and Innovation", url:"https://www.unlv.edu/troeshcenter"},
  {id:"campus-90", name:"San Diego State University", state:"CA", program:"ZIP Launchpad", url:"https://ziplaunchpad.sdsu.edu/"},
  {id:"campus-91", name:"UC San Diego", state:"CA", program:"The Basement", url:"https://thebasement.ucsd.edu/"},
  {id:"campus-92", name:"UC Irvine", state:"CA", program:"Beall Center for Innovation and Entrepreneurship", url:"https://innovation.uci.edu/"},
  {id:"campus-93", name:"Cal Poly San Luis Obispo", state:"CA", program:"Center for Innovation & Entrepreneurship", url:"https://cie.calpoly.edu/"},
  {id:"campus-94", name:"Santa Clara University", state:"CA", program:"Ciocca Center for Innovation and Entrepreneurship", url:"https://www.scu.edu/cioccacenter/"},
  {id:"campus-95", name:"Oregon State University", state:"OR", program:"InnovationX", url:"https://business.oregonstate.edu/innovationx"},
  {id:"campus-96", name:"University of Oregon", state:"OR", program:"Lundquist Center for Entrepreneurship", url:"https://business.uoregon.edu/centers/lundquist-center-for-entrepreneurship"},
  {id:"campus-97", name:"Portland State University", state:"OR", program:"Center for Entrepreneurship", url:"https://www.pdx.edu/business/center-entrepreneurship"},
  {id:"campus-98", name:"Boise State University", state:"ID", program:"Venture College", url:"https://www.boisestate.edu/venturecollege/"},
  {id:"campus-99", name:"University of Iowa", state:"IA", program:"John Pappajohn Entrepreneurial Center", url:"https://iowajpec.org/"},
  {id:"campus-100", name:"Iowa State University", state:"IA", program:"Pappajohn Center for Entrepreneurship", url:"https://www.isupjcenter.org/"}
];

const seedPartners = [
  {id:"partner-1", name:"AfroTech Conference", type:"Event", bio:"Massive Black tech, founder, investor, and career conference for innovators across technology, startups, culture, and business.", url:"https://afrotechconference.com/", tags:["Tech","Conference","Startups"]},
  {id:"partner-2", name:"Black Is Tech Conference", type:"Event", bio:"Large tech conference for Black professionals, founders, students, engineers, creatives, and emerging innovators.", url:"https://blackistechconference.com/", tags:["Tech","Conference","Career"]},
  {id:"partner-3", name:"Black Tech Week", type:"Event", bio:"Cincinnati-based Black tech and startup conference connecting founders, investors, creatives, and ecosystem builders.", url:"https://www.blacktechweek.com/", tags:["Tech","Startups","Founders"]},
  {id:"partner-4", name:"Black Founders", type:"Organization", bio:"Organization creating programs, events, and resources to support Black entrepreneurs building technology companies.", url:"https://blackfounders.com/", tags:["Founders","Startups","Tech"]},
  {id:"partner-5", name:"Google Black Founders Fund", type:"Funding", bio:"Google startup program providing equity-free funding, mentorship, and support for Black-led startups.", url:"https://startup.google.com/programs/black-founders-fund/", tags:["Funding","Startups","Google"]},
  {id:"partner-6", name:"UNCF HBCU Innovation Summit", type:"Event", bio:"Connects HBCU students with Silicon Valley leaders, innovation opportunities, and technology career pathways.", url:"https://uncf.org/programs/hbcu-innovation-summit", tags:["HBCU","Tech","Students"]},
  {id:"partner-7", name:"National Society of Black Engineers", type:"Organization", bio:"Premier national organization for Black engineers, STEM students, technical leaders, and future innovators.", url:"https://www.nsbe.org/", tags:["Engineering","STEM","Students"]},
  {id:"partner-8", name:"NSBE Convention", type:"Event", bio:"Major annual career, networking, STEM, leadership, and recruiting event for Black engineers and students.", url:"https://convention.nsbe.org/", tags:["Engineering","Conference","Career"]},
  {id:"partner-9", name:"Black Enterprise Disruptor Summit", type:"Event", bio:"Business, wealth, innovation, leadership, and entrepreneurship summit for Black professionals and founders.", url:"https://www.blackenterprise.com/", tags:["Business","Wealth","Leadership"]},
  {id:"partner-10", name:"National Urban League Conference", type:"Event", bio:"National gathering focused on economic empowerment, jobs, entrepreneurship, policy, equity, and community leadership.", url:"https://nul.org/", tags:["Business","Policy","Community"]},

  {id:"partner-11", name:"National Black MBA Association", type:"Organization", bio:"Business leadership and career network supporting Black MBA students, professionals, executives, and entrepreneurs.", url:"https://nbmbaa.org/", tags:["Business","MBA","Career"]},
  {id:"partner-12", name:"NBMBAA Conference", type:"Event", bio:"Major corporate recruiting, leadership, professional development, and entrepreneurship conference for Black business talent.", url:"https://nbmbaa.org/conference/", tags:["Business","Conference","Career"]},
  {id:"partner-13", name:"NBMBAA Scale-Up Pitch Challenge", type:"Competition", bio:"Pitch competition giving founders access to exposure, coaching, potential funding, and business development resources.", url:"https://nbmbaa.org/", tags:["Pitch","Startups","Funding"]},
  {id:"partner-14", name:"Black Women Talk Tech", type:"Organization", bio:"Community and platform supporting Black women tech founders through events, funding access, and founder resources.", url:"https://www.blackwomentalktech.com/", tags:["Women","Tech","Founders"]},
  {id:"partner-15", name:"Roadmap to Billions", type:"Event", bio:"Conference created for Black women founders, investors, builders, and startup leaders.", url:"https://www.roadmaptobillions.com/", tags:["Women","Founders","Conference"]},
  {id:"partner-16", name:"digitalundivided", type:"Organization", bio:"Supports Black and Latina women entrepreneurs through research, programs, community, and startup development.", url:"https://www.digitalundivided.com/", tags:["Women","Founders","Startups"]},
  {id:"partner-17", name:"BIG Incubator", type:"Accelerator", bio:"Startup support program from digitalundivided designed for Black and Latina women entrepreneurs.", url:"https://www.digitalundivided.com/big-incubator", tags:["Accelerator","Women","Startups"]},
  {id:"partner-18", name:"Code2040", type:"Organization", bio:"Works to advance racial equity in technology and expand pathways for Black and Latinx technologists.", url:"https://www.code2040.org/", tags:["Tech","Equity","Career"]},
  {id:"partner-19", name:"/dev/color", type:"Organization", bio:"Career acceleration community for Black software engineers, engineering leaders, and technologists.", url:"https://www.devcolor.org/", tags:["Software","Engineering","Career"]},
  {id:"partner-20", name:"Blacks In Technology", type:"Organization", bio:"Global community for Black technology professionals, entrepreneurs, engineers, and digital innovators.", url:"https://www.blacksintechnology.net/", tags:["Tech","Community","Career"]},

  {id:"partner-21", name:"BITCON", type:"Event", bio:"Annual Blacks In Technology conference focused on technology, professional growth, networking, and innovation.", url:"https://www.bitcon.tech/", tags:["Tech","Conference","Community"]},
  {id:"partner-22", name:"Black Data Processing Associates", type:"Organization", bio:"Technology education, professional development, coding, and career network for Black technologists.", url:"https://www.bdpa.org/", tags:["Tech","Coding","Career"]},
  {id:"partner-23", name:"BDPA Technology Conference", type:"Event", bio:"STEM, coding, technology, leadership, and career conference supporting diverse tech talent.", url:"https://www.bdpa.org/", tags:["Tech","Conference","STEM"]},
  {id:"partner-24", name:"Black Tech Pipeline", type:"Organization", bio:"Connects Black technologists to jobs, opportunities, community, visibility, and career resources.", url:"https://blacktechpipeline.com/", tags:["Jobs","Tech","Community"]},
  {id:"partner-25", name:"Black Product Managers Network", type:"Organization", bio:"Community for Black product managers and aspiring product leaders in tech and business.", url:"https://www.blackproductmanagers.com/", tags:["Product","Tech","Career"]},
  {id:"partner-26", name:"Black UX Labs", type:"Organization", bio:"Community and resource hub for Black UX designers, product designers, and researchers.", url:"https://blackuxlabs.com/", tags:["UX","Design","Product"]},
  {id:"partner-27", name:"ColorStack", type:"Organization", bio:"Community for Black and Latinx computer science students with opportunities, events, and support.", url:"https://www.colorstack.org/", tags:["Students","Computer Science","Community"]},
  {id:"partner-28", name:"Rewriting the Code", type:"Organization", bio:"Career community supporting women in technology, including Black women technologists and students.", url:"https://rewritingthecode.org/", tags:["Women","Tech","Career"]},
  {id:"partner-29", name:"Black Girls CODE", type:"Organization", bio:"Coding and technology education organization helping Black girls build skills and confidence in tech.", url:"https://wearebgc.org/", tags:["Youth","Coding","STEM"]},
  {id:"partner-30", name:"Hidden Genius Project", type:"Organization", bio:"Trains Black male youth in technology creation, entrepreneurship, leadership, and community impact.", url:"https://www.hiddengeniusproject.org/", tags:["Youth","Tech","Entrepreneurship"]},

  {id:"partner-31", name:"All Star Code", type:"Organization", bio:"Technology entrepreneurship program helping young men of color build coding, leadership, and startup skills.", url:"https://www.allstarcode.org/", tags:["Youth","Coding","Entrepreneurship"]},
  {id:"partner-32", name:"SMASH", type:"Organization", bio:"STEM college-prep and career pathway program for students from underrepresented communities.", url:"https://www.smash.org/", tags:["STEM","Students","College Prep"]},
  {id:"partner-33", name:"INROADS", type:"Organization", bio:"Career development and internship access organization for diverse students and emerging professionals.", url:"https://inroads.org/", tags:["Internships","Career","Students"]},
  {id:"partner-34", name:"Management Leadership for Tomorrow", type:"Organization", bio:"Career acceleration organization supporting underrepresented students and professionals through coaching and networks.", url:"https://mlt.org/", tags:["Career","Leadership","Students"]},
  {id:"partner-35", name:"SEO", type:"Organization", bio:"Education and career access organization supporting underserved students through academics, internships, and professional development.", url:"https://www.seo-usa.org/", tags:["Career","Education","Internships"]},
  {id:"partner-36", name:"Thurgood Marshall College Fund", type:"Organization", bio:"Scholarships, leadership development, internships, and support for students at publicly supported HBCUs.", url:"https://www.tmcf.org/", tags:["HBCU","Scholarships","Career"]},
  {id:"partner-37", name:"UNCF", type:"Organization", bio:"National scholarship and HBCU support organization helping Black students access education and opportunity.", url:"https://uncf.org/", tags:["Scholarships","HBCU","Students"]},
  {id:"partner-38", name:"HBCU First", type:"Organization", bio:"Career, leadership, and near-peer programs designed to support HBCU students and alumni.", url:"https://hbcufirst.com/", tags:["HBCU","Career","Leadership"]},
  {id:"partner-39", name:"HBCUvc", type:"Organization", bio:"Trains HBCU students and alumni in venture capital, investing, entrepreneurship, and startup ecosystems.", url:"https://www.hbcu.vc/", tags:["HBCU","Venture Capital","Startups"]},
  {id:"partner-40", name:"HBCU Battle of the Brains", type:"Competition", bio:"Business, technology, and innovation case competition showcasing HBCU student talent.", url:"https://www.hbcubattleofthebrains.com/", tags:["HBCU","Competition","Innovation"]},

  {id:"partner-41", name:"HBCU Week Foundation", type:"Organization", bio:"Promotes HBCU access through college fairs, scholarships, events, and student opportunity programs.", url:"https://www.hbcuweek.org/", tags:["HBCU","Scholarships","Students"]},
  {id:"partner-42", name:"HBCU Connect", type:"Organization", bio:"Career, networking, recruiting, and community platform for HBCU students and alumni.", url:"https://www.hbcuconnect.com/", tags:["HBCU","Jobs","Networking"]},
  {id:"partner-43", name:"HBCU Career Development Marketplace", type:"Event", bio:"Career development and recruiting event connecting HBCU students with employers and opportunities.", url:"https://www.hbcucareermarket.org/", tags:["HBCU","Career","Recruiting"]},
  {id:"partner-44", name:"National Action Network Convention", type:"Event", bio:"Civil rights, business, policy, entrepreneurship, and empowerment gathering for community leaders.", url:"https://nationalactionnetwork.net/", tags:["Policy","Leadership","Community"]},
  {id:"partner-45", name:"Congressional Black Caucus Foundation ALC", type:"Event", bio:"Annual Legislative Conference focused on policy, leadership, culture, entrepreneurship, and Black advancement.", url:"https://www.cbcfinc.org/annual-legislative-conference/", tags:["Policy","Leadership","Culture"]},
  {id:"partner-46", name:"NAACP National Convention", type:"Event", bio:"National advocacy, culture, policy, leadership, and community empowerment convention.", url:"https://naacp.org/", tags:["Civil Rights","Leadership","Community"]},
  {id:"partner-47", name:"NAACP ACT-SO", type:"Program", bio:"Youth achievement program recognizing excellence in STEM, business, arts, humanities, and innovation.", url:"https://naacp.org/act-so", tags:["Youth","STEM","Arts"]},
  {id:"partner-48", name:"National Urban League Entrepreneurship Center", type:"Organization", bio:"Business support and economic empowerment resource for entrepreneurs and small business owners.", url:"https://nul.org/", tags:["Entrepreneurship","Business","Community"]},
  {id:"partner-49", name:"Urban League Young Professionals", type:"Organization", bio:"Leadership and service network for young Black professionals across the country.", url:"https://nulyp.org/", tags:["Leadership","Networking","Professionals"]},
  {id:"partner-50", name:"The Gathering Spot", type:"Organization", bio:"Membership community and club for creators, professionals, entrepreneurs, and cultural leaders.", url:"https://thegatheringspot.club/", tags:["Networking","Creators","Business"]},

  {id:"partner-51", name:"CultureCon", type:"Event", bio:"Conference for Black and multicultural creatives focused on storytelling, branding, entrepreneurship, and culture.", url:"https://www.culturecon.com/", tags:["Creatives","Culture","Conference"]},
  {id:"partner-52", name:"The Creative Collective NYC", type:"Organization", bio:"Creative community behind CultureCon supporting creatives of color through events and storytelling.", url:"https://www.imcreativecollective.com/", tags:["Creatives","Culture","Community"]},
  {id:"partner-53", name:"BlackStar Projects", type:"Organization", bio:"Film, media, arts, and cultural organization advancing Black, Brown, and Indigenous storytelling.", url:"https://www.blackstarfest.org/", tags:["Film","Media","Arts"]},
  {id:"partner-54", name:"BlackStar Film Festival", type:"Event", bio:"Major Black film, media, and storytelling festival centered on independent creators and culture.", url:"https://www.blackstarfest.org/festival/", tags:["Film","Festival","Media"]},
  {id:"partner-55", name:"American Black Film Festival", type:"Event", bio:"Premier festival and marketplace for Black film, entertainment, media, and storytelling talent.", url:"https://www.abff.com/", tags:["Film","Entertainment","Festival"]},
  {id:"partner-56", name:"Martha’s Vineyard African American Film Festival", type:"Event", bio:"Black film, culture, and storytelling festival celebrating filmmakers, actors, and creative innovators.", url:"https://mvaaff.com/", tags:["Film","Festival","Culture"]},
  {id:"partner-57", name:"BronzeLens Film Festival", type:"Event", bio:"Atlanta-based film festival showcasing Black filmmakers, producers, actors, and media creators.", url:"https://bronzelens.com/", tags:["Film","Atlanta","Creatives"]},
  {id:"partner-58", name:"Essence Festival of Culture", type:"Event", bio:"Massive culture, business, beauty, wellness, music, and empowerment festival.", url:"https://www.essence.com/festival/", tags:["Culture","Business","Festival"]},
  {id:"partner-59", name:"Essence GU Summit", type:"Event", bio:"Summit for young Black women focused on empowerment, creativity, wellness, culture, and leadership.", url:"https://www.essence.com/gu/", tags:["Women","Culture","Leadership"]},
  {id:"partner-60", name:"Blavity", type:"Organization", bio:"Media and event platform serving Black millennials, creators, entrepreneurs, and cultural innovators.", url:"https://blavityinc.com/", tags:["Media","Culture","Creators"]},

  {id:"partner-61", name:"21Ninety Summit", type:"Event", bio:"Wellness, lifestyle, career, and leadership event for Black women and creators.", url:"https://21ninety.com/", tags:["Women","Wellness","Leadership"]},
  {id:"partner-62", name:"Dreamville Festival", type:"Event", bio:"Music, culture, entrepreneurship, and creative networking festival with strong cultural influence.", url:"https://dreamvillefest.com/", tags:["Music","Culture","Creatives"]},
  {id:"partner-63", name:"SXSW", type:"Event", bio:"Major innovation, startup, film, music, media, and technology festival in Austin.", url:"https://www.sxsw.com/", tags:["Innovation","Tech","Festival"]},
  {id:"partner-64", name:"SXSW EDU", type:"Event", bio:"Education innovation conference focused on learning, technology, policy, and future education models.", url:"https://www.sxswedu.com/", tags:["Education","Innovation","Conference"]},
  {id:"partner-65", name:"ComplexCon", type:"Event", bio:"Culture, fashion, music, art, brand, and creative commerce event.", url:"https://www.complexcon.com/", tags:["Culture","Fashion","Creators"]},
  {id:"partner-66", name:"Adobe MAX", type:"Event", bio:"Major design, creativity, AI, digital media, and creative technology conference.", url:"https://max.adobe.com/", tags:["Design","AI","Creatives"]},
  {id:"partner-67", name:"AIGA Design Conference", type:"Event", bio:"Design leadership and creative community conference for designers, strategists, and visual innovators.", url:"https://www.aiga.org/design/aiga-design-conference", tags:["Design","Creatives","Conference"]},
  {id:"partner-68", name:"VidCon", type:"Event", bio:"Creator economy, digital media, video, influencer, and online entertainment conference.", url:"https://www.vidcon.com/", tags:["Creators","Media","Video"]},
  {id:"partner-69", name:"Creator Economy Expo", type:"Event", bio:"Conference for content entrepreneurs building media businesses, audiences, and creator-led brands.", url:"https://cex.events/", tags:["Creators","Business","Media"]},
  {id:"partner-70", name:"Podcast Movement", type:"Event", bio:"Major podcasting and audio creator conference for storytellers, media founders, and producers.", url:"https://podcastmovement.com/", tags:["Podcasting","Media","Creators"]},

  {id:"partner-71", name:"Black Podcasting Awards", type:"Event", bio:"Recognition platform celebrating Black audio creators, podcasters, producers, and storytellers.", url:"https://blackpodawards.com/", tags:["Podcasting","Awards","Media"]},
  {id:"partner-72", name:"National Association of Black Journalists", type:"Organization", bio:"Professional network for Black journalists, media professionals, communicators, and storytellers.", url:"https://nabjonline.org/", tags:["Journalism","Media","Career"]},
  {id:"partner-73", name:"NABJ Convention", type:"Event", bio:"Major media, journalism, communications, and career conference for Black storytellers.", url:"https://nabjonline.org/convention/", tags:["Journalism","Conference","Media"]},
  {id:"partner-74", name:"National Association of Black Accountants", type:"Organization", bio:"Professional organization supporting Black accountants, finance professionals, students, and business leaders.", url:"https://www.nabainc.org/", tags:["Finance","Accounting","Career"]},
  {id:"partner-75", name:"NABA Convention", type:"Event", bio:"Career, leadership, business, accounting, and finance event for Black professionals and students.", url:"https://www.nabainc.org/", tags:["Finance","Conference","Career"]},
  {id:"partner-76", name:"National Black Chamber of Commerce", type:"Organization", bio:"National organization supporting Black-owned businesses, entrepreneurship, advocacy, and economic development.", url:"https://www.nationalbcc.org/", tags:["Business","Entrepreneurship","Advocacy"]},
  {id:"partner-77", name:"U.S. Black Chambers", type:"Organization", bio:"Advocacy and business support organization for Black entrepreneurs and chambers of commerce.", url:"https://usblackchambers.org/", tags:["Business","Entrepreneurship","Advocacy"]},
  {id:"partner-78", name:"ByBlack", type:"Organization", bio:"Black-owned business certification and directory platform supporting visibility and economic growth.", url:"https://byblack.us/", tags:["Business","Directory","Certification"]},
  {id:"partner-79", name:"Operation HOPE", type:"Organization", bio:"Financial literacy, entrepreneurship, credit, homeownership, and wealth-building organization.", url:"https://operationhope.org/", tags:["Finance","Wealth","Entrepreneurship"]},
  {id:"partner-80", name:"Hope Global Forums", type:"Event", bio:"Economic empowerment, inclusive capitalism, entrepreneurship, and financial dignity conference.", url:"https://hopeglobalforums.org/", tags:["Finance","Business","Conference"]},

  {id:"partner-81", name:"Black Ambition", type:"Funding", bio:"Prize competition and founder support platform for Black and Hispanic entrepreneurs.", url:"https://www.blackambitionprize.com/", tags:["Funding","Pitch","Founders"]},
  {id:"partner-82", name:"New Voices Foundation", type:"Organization", bio:"Supports women of color entrepreneurs through funding, coaching, accelerators, and community.", url:"https://newvoicesfoundation.org/", tags:["Women","Funding","Entrepreneurship"]},
  {id:"partner-83", name:"Fearless Fund", type:"Funding", bio:"Venture funding and programs focused on women of color founders and entrepreneurs.", url:"https://www.fearless.fund/", tags:["Funding","Women","Startups"]},
  {id:"partner-84", name:"Harlem Capital", type:"Investor", bio:"Venture capital firm focused on investing in diverse founders and high-growth startups.", url:"https://harlem.capital/", tags:["Venture Capital","Funding","Startups"]},
  {id:"partner-85", name:"Backstage Capital", type:"Investor", bio:"Venture capital fund backing underestimated founders, including Black, women, and LGBTQ+ entrepreneurs.", url:"https://backstagecapital.com/", tags:["Venture Capital","Funding","Startups"]},
  {id:"partner-86", name:"Collab Capital", type:"Investor", bio:"Investment firm focused on funding and supporting Black founders building scalable companies.", url:"https://collab.capital/", tags:["Funding","Black Founders","Startups"]},
  {id:"partner-87", name:"Lightship Foundation", type:"Organization", bio:"Supports underrepresented founders and innovation ecosystems through programs, capital access, and education.", url:"https://www.lightship.foundation/", tags:["Founders","Startups","Ecosystem"]},
  {id:"partner-88", name:"Lightship Bootcamp", type:"Accelerator", bio:"Founder bootcamp helping high-growth startups refine strategy, fundraising, product, and scale.", url:"https://www.lightship.foundation/", tags:["Accelerator","Founders","Startups"]},
  {id:"partner-89", name:"Techstars Founder Catalyst", type:"Accelerator", bio:"Startup programs often focused on underrepresented founders, ecosystem building, and early-stage entrepreneurship.", url:"https://www.techstars.com/communities/founder-catalyst", tags:["Accelerator","Startups","Founders"]},
  {id:"partner-90", name:"DivInc", type:"Accelerator", bio:"Startup accelerator supporting underrepresented founders through mentorship, programming, and investor access.", url:"https://www.divinc.org/", tags:["Accelerator","Startups","Founders"]},

  {id:"partner-91", name:"Camelback Ventures", type:"Accelerator", bio:"Supports entrepreneurs of color and women founders building education, social impact, and justice-focused ventures.", url:"https://www.camelbackventures.org/", tags:["Accelerator","Social Impact","Founders"]},
  {id:"partner-92", name:"Founder Gym", type:"Organization", bio:"Online training program helping underrepresented founders learn fundraising, startup strategy, and investor readiness.", url:"https://foundergym.com/", tags:["Founders","Training","Startups"]},
  {id:"partner-93", name:"Pipeline Angels", type:"Organization", bio:"Angel investing education network focused on women and nonbinary investors and inclusive capital access.", url:"https://pipelineangels.com/", tags:["Investing","Funding","Education"]},
  {id:"partner-94", name:"Black Innovation Alliance", type:"Organization", bio:"Coalition supporting Black innovation organizations, ecosystems, entrepreneurs, and inclusive economic growth.", url:"https://blackinnovationalliance.com/", tags:["Innovation","Ecosystem","Entrepreneurship"]},
  {id:"partner-95", name:"Kapor Center", type:"Organization", bio:"Works at the intersection of racial justice, technology, entrepreneurship, education, and inclusive innovation.", url:"https://www.kaporcenter.org/", tags:["Tech","Equity","Startups"]},
  {id:"partner-96", name:"Opportunity Hub", type:"Organization", bio:"Inclusive innovation, entrepreneurship, tech, and startup ecosystem builder supporting underestimated communities.", url:"https://opportunityhub.co/", tags:["Innovation","Startups","Ecosystem"]},
  {id:"partner-97", name:"Venture Atlanta", type:"Event", bio:"Major startup and investor conference with strong value for Southeast founders and innovation ecosystems.", url:"https://www.ventureatlanta.org/", tags:["Startups","Investors","Conference"]},
  {id:"partner-98", name:"TechCrunch Disrupt", type:"Event", bio:"Startup, venture capital, AI, product, and founder conference featuring pitches, networking, and tech trends.", url:"https://techcrunch.com/events/", tags:["Startups","Tech","Investors"]},
  {id:"partner-99", name:"Web Summit Vancouver", type:"Event", bio:"Major North American technology and startup conference for founders, investors, builders, and global innovators.", url:"https://vancouver.websummit.com/", tags:["Tech","Startups","Conference"]},
  {id:"partner-100", name:"Grace Hopper Celebration", type:"Event", bio:"Major women-in-tech conference especially valuable for Black women technologists, students, and technical leaders.", url:"https://ghc.anitab.org/", tags:["Women","Tech","Conference"]}
];

const seedScholarships = [
  {id:"s1", title:"UNCF STEM Scholars", amount:"Up to $25,000+", org:"UNCF", url:"https://uncf.org/programs/fund-ii-uncf-stem-scholars/pages/stem-scholars-scholarship-overview", tags:["STEM","Black Students","Undergrad"], blurb:"Elite STEM pathway for African American students pursuing science, tech, engineering, and math careers."},
  {id:"s2", title:"Ron Brown Scholar Program", amount:"$40,000", org:"Ron Brown Scholar Program", url:"https://ronbrown.org/ron-brown-scholarship/", tags:["Leadership","Black Students"], blurb:"Prestigious scholarship for Black high school seniors with leadership, service, and academic excellence."},
  {id:"s3", title:"Jackie Robinson Foundation Scholarship", amount:"Up to $35,000", org:"Jackie Robinson Foundation", url:"https://jackierobinson.org/scholarship/", tags:["Leadership","Mentorship"], blurb:"Scholarship, mentoring, and leadership development for minority college students."},
  {id:"s4", title:"The Gates Scholarship", amount:"Cost of attendance", org:"The Gates Scholarship", url:"https://www.thegatesscholarship.org/", tags:["Full Ride","High School Seniors"], blurb:"Highly selective last-dollar scholarship for outstanding minority high school seniors."},
  {id:"s5", title:"Thurgood Marshall College Fund Scholarships", amount:"Varies", org:"TMCF", url:"https://www.tmcf.org/students-alumni/scholarships/", tags:["HBCU","College"], blurb:"Major scholarship hub for students attending publicly supported HBCUs and PBIs."},
  {id:"s6", title:"UNCF General Scholarships", amount:"Varies", org:"UNCF", url:"https://uncf.org/scholarships", tags:["Black Students","All Majors"], blurb:"Large scholarship database supporting Black students across majors, schools, and career paths."},
  {id:"s7", title:"Blacks at Microsoft Scholarship", amount:"$2,500–$5,000", org:"Microsoft", url:"https://www.microsoft.com/en-us/diversity/programs/bam-scholarship.aspx", tags:["Tech","Business","Black Students"], blurb:"Supports Black students pursuing technology, engineering, business, and related careers."},
  {id:"s8", title:"Generation Google Scholarship", amount:"$10,000", org:"Google", url:"https://buildyourfuture.withgoogle.com/scholarships", tags:["Computer Science","Tech"], blurb:"Supports students pursuing computer science degrees and leadership in technology."},
  {id:"s9", title:"Amazon Future Engineer Scholarship", amount:"$40,000", org:"Amazon", url:"https://www.amazonfutureengineer.com/scholarships", tags:["Computer Science","Engineering"], blurb:"Scholarship and internship pathway for students pursuing computer science or engineering."},
  {id:"s10", title:"Dell Scholars Program", amount:"$20,000", org:"Michael & Susan Dell Foundation", url:"https://www.dellscholars.org/scholarship/", tags:["College Success","First Gen"], blurb:"College completion scholarship with financial support, laptop, resources, and advising."},

  {id:"s11", title:"Coca-Cola Scholars Program", amount:"$20,000", org:"Coca-Cola Scholars Foundation", url:"https://www.coca-colascholarsfoundation.org/apply/", tags:["Leadership","High School Seniors"], blurb:"National leadership scholarship for high-achieving students with strong service records."},
  {id:"s12", title:"GE-Reagan Foundation Scholarship", amount:"Up to $40,000", org:"Reagan Foundation", url:"https://www.reaganfoundation.org/education/scholarship-programs/ge-reagan-foundation-scholarship-program/", tags:["Leadership","Service"], blurb:"Rewards students who demonstrate leadership, drive, integrity, and citizenship."},
  {id:"s13", title:"Horatio Alger National Scholarship", amount:"Up to $25,000", org:"Horatio Alger Association", url:"https://horatioalger.org/scholarships/", tags:["Adversity","Need Based"], blurb:"For students who have overcome adversity and show commitment to pursuing higher education."},
  {id:"s14", title:"Burger King Scholars", amount:"$1,000–$60,000", org:"Burger King Foundation", url:"https://bk-scholars.com/", tags:["High School","College"], blurb:"Broad scholarship program supporting students, employees, and families pursuing college."},
  {id:"s15", title:"Actuarial Diversity Scholarship", amount:"$1,000–$4,000", org:"The Actuarial Foundation", url:"https://actuarialfoundation.org/scholarships/actuarial-diversity-scholarship/", tags:["Math","Business","Diversity"], blurb:"Supports Black, Hispanic, Native, and Pacific Islander students pursuing actuarial careers."},
  {id:"s16", title:"ACS Scholars Program", amount:"Up to $5,000", org:"American Chemical Society", url:"https://www.acs.org/education/acs-scholars.html", tags:["Chemistry","STEM"], blurb:"Scholarship for underrepresented students pursuing chemistry-related degrees."},
  {id:"s17", title:"AICPA Minority Accounting Scholarship", amount:"Up to $10,000", org:"AICPA", url:"https://www.aicpa-cima.com/resources/article/aicpa-foundation-scholarship-for-minority-accounting-students", tags:["Accounting","Business"], blurb:"Supports minority students pursuing accounting and CPA careers."},
  {id:"s18", title:"APF Queen-Nellie Evans Scholarship", amount:"$4,000", org:"American Psychological Foundation", url:"https://apf.apa.org/funding/queen-nellie-evans/", tags:["Psychology","Graduate"], blurb:"Graduate psychology scholarship supporting minority students committed to underserved communities."},
  {id:"s19", title:"AMS Minority Scholarship", amount:"$6,000", org:"American Meteorological Society", url:"https://www.ametsoc.org/index.cfm/ams/information-for/students/ams-scholarships-and-fellowships/ams-minority-scholarships/", tags:["Weather","Climate","STEM"], blurb:"Supports underrepresented students entering atmospheric, oceanic, or hydrologic sciences."},
  {id:"s20", title:"NACME Scholars Program", amount:"Varies", org:"NACME", url:"https://www.nacme.org/scholarships", tags:["Engineering","Diversity"], blurb:"Engineering scholarships for underrepresented students pursuing technical careers."},

  {id:"s21", title:"NSBE Scholarships", amount:"Varies", org:"NSBE", url:"https://www.nsbe.org/scholarships", tags:["Engineering","Black Students"], blurb:"Scholarships for Black engineers and STEM students through NSBE programs and partners."},
  {id:"s22", title:"Society of Women Engineers Scholarships", amount:"Varies", org:"SWE", url:"https://swe.org/scholarships/", tags:["Engineering","Women"], blurb:"Supports women pursuing engineering, technology, and computing degrees."},
  {id:"s23", title:"AnitaB.org Scholarships", amount:"Varies", org:"AnitaB.org", url:"https://anitab.org/awards-grants/", tags:["Women in Tech","Computing"], blurb:"Scholarships and awards supporting women and nonbinary technologists."},
  {id:"s24", title:"Society of Physics Students Scholarships", amount:"Varies", org:"SPS", url:"https://www.spsnational.org/scholarships", tags:["Physics","STEM"], blurb:"Scholarships for undergraduate physics students and future researchers."},
  {id:"s25", title:"SME Education Foundation Scholarships", amount:"Varies", org:"SME Education Foundation", url:"https://www.smeef.org/sme-education-foundation-scholarships/", tags:["Manufacturing","Engineering"], blurb:"Supports students pursuing manufacturing, engineering, and technical career pathways."},
  {id:"s26", title:"ASME Scholarships", amount:"Varies", org:"ASME", url:"https://www.asme.org/asme-programs/students-and-faculty/scholarships", tags:["Mechanical Engineering"], blurb:"Scholarships for mechanical engineering students and future technical leaders."},
  {id:"s27", title:"IEEE PES Scholarship Plus", amount:"Up to $10,000", org:"IEEE PES", url:"https://www.ee-scholarship.org/", tags:["Power","Energy","Electrical"], blurb:"Supports electrical engineering students interested in power and energy careers."},
  {id:"s28", title:"IEEE Computer Society Scholarships", amount:"Varies", org:"IEEE Computer Society", url:"https://www.computer.org/volunteering/awards/scholarships", tags:["Computer Science","Tech"], blurb:"Scholarship and award opportunities for computing students and innovators."},
  {id:"s29", title:"Lockheed Martin STEM Scholarship", amount:"$10,000 renewable", org:"Lockheed Martin", url:"https://www.lockheedmartin.com/en-us/who-we-are/communities/stem-education/lm-scholarship-program.html", tags:["Engineering","STEM"], blurb:"Supports students pursuing engineering and computer science degrees."},
  {id:"s30", title:"SMART Scholarship", amount:"Full tuition + stipend", org:"Department of Defense", url:"https://www.smartscholarship.org/smart", tags:["STEM","Defense","Full Tuition"], blurb:"Full scholarship, stipend, internships, and post-graduation employment pathway in STEM."},

  {id:"s31", title:"CIA Undergraduate Scholarship Program", amount:"Up to $18,000+", org:"CIA", url:"https://www.cia.gov/careers/student-programs/", tags:["Government","STEM","Public Service"], blurb:"Paid scholarship and work program for undergraduate students interested in intelligence careers."},
  {id:"s32", title:"NASA Internships and Fellowships", amount:"Varies", org:"NASA", url:"https://stemgateway.nasa.gov/", tags:["Space","STEM"], blurb:"NASA STEM opportunities for students pursuing aerospace, research, science, and engineering."},
  {id:"s33", title:"National GEM Consortium Fellowship", amount:"Varies", org:"GEM Consortium", url:"https://www.gemfellowship.org/", tags:["Graduate","Engineering","STEM"], blurb:"Graduate fellowship for underrepresented students pursuing master’s and PhD STEM degrees."},
  {id:"s34", title:"NSF Graduate Research Fellowship", amount:"$37,000 stipend", org:"NSF", url:"https://www.nsfgrfp.org/", tags:["Graduate","Research","STEM"], blurb:"Prestigious graduate fellowship supporting research-based master’s and doctoral study."},
  {id:"s35", title:"Ford Foundation Fellowship", amount:"Varies", org:"National Academies", url:"https://sites.nationalacademies.org/PGA/FordFellowships/", tags:["Graduate","Diversity","Research"], blurb:"Fellowships supporting scholars committed to diversity in higher education."},
  {id:"s36", title:"AAUW Fellowships and Grants", amount:"Varies", org:"AAUW", url:"https://www.aauw.org/resources/programs/fellowships-grants/", tags:["Women","Graduate","Research"], blurb:"Funding for women pursuing education, research, and leadership."},
  {id:"s37", title:"PEO Scholar Awards", amount:"Up to $25,000", org:"P.E.O. International", url:"https://www.peointernational.org/peo-scholar-awards/", tags:["Women","Doctoral"], blurb:"Merit-based awards for women pursuing doctoral-level study."},
  {id:"s38", title:"McNair Scholars Program", amount:"Program support", org:"U.S. Department of Education", url:"https://www2.ed.gov/programs/triomcnair/index.html", tags:["Graduate Prep","First Gen"], blurb:"Prepares underrepresented and first-generation students for doctoral study."},
  {id:"s39", title:"Goldwater Scholarship", amount:"Up to $7,500", org:"Goldwater Foundation", url:"https://goldwaterscholarship.gov/", tags:["STEM","Research"], blurb:"Top national scholarship for undergraduate STEM researchers."},
  {id:"s40", title:"Udall Scholarship", amount:"Up to $7,000", org:"Udall Foundation", url:"https://www.udall.gov/OurPrograms/Scholarship/Scholarship.aspx", tags:["Environment","Public Service"], blurb:"For students committed to environmental, tribal policy, or public service leadership."},

  {id:"s41", title:"Truman Scholarship", amount:"Up to $30,000", org:"Truman Foundation", url:"https://www.truman.gov/", tags:["Public Service","Leadership"], blurb:"Premier graduate scholarship for future public service leaders."},
  {id:"s42", title:"Marshall Scholarship", amount:"Full funding", org:"Marshall Scholarships", url:"https://www.marshallscholarship.org/", tags:["Global","Graduate"], blurb:"Funds graduate study in the United Kingdom for outstanding U.S. students."},
  {id:"s43", title:"Rhodes Scholarship", amount:"Full funding", org:"Rhodes Trust", url:"https://www.rhodeshouse.ox.ac.uk/scholarships/", tags:["Global","Leadership","Graduate"], blurb:"Prestigious scholarship funding study at the University of Oxford."},
  {id:"s44", title:"Schwarzman Scholars", amount:"Full funding", org:"Schwarzman Scholars", url:"https://www.schwarzmanscholars.org/", tags:["Global Leadership","Graduate"], blurb:"Fully funded master’s program in global affairs and leadership at Tsinghua University."},
  {id:"s45", title:"Knight-Hennessy Scholars", amount:"Full funding", org:"Stanford University", url:"https://knight-hennessy.stanford.edu/", tags:["Graduate","Leadership"], blurb:"Full graduate funding for leaders pursuing Stanford graduate degrees."},
  {id:"s46", title:"Fulbright U.S. Student Program", amount:"Varies", org:"Fulbright", url:"https://us.fulbrightonline.org/", tags:["Global","Research","Study Abroad"], blurb:"Funds international research, study, and teaching opportunities."},
  {id:"s47", title:"Gilman Scholarship", amount:"Up to $5,000", org:"U.S. Department of State", url:"https://www.gilmanscholarship.org/", tags:["Study Abroad","Pell Grant"], blurb:"Study abroad scholarship for U.S. undergraduate Pell Grant recipients."},
  {id:"s48", title:"Fund for Education Abroad Scholarships", amount:"Up to $10,000", org:"Fund for Education Abroad", url:"https://fundforeducationabroad.org/scholarships/", tags:["Study Abroad","Underrepresented"], blurb:"Study abroad funding with emphasis on students underrepresented in global education."},
  {id:"s49", title:"Boren Awards", amount:"Up to $25,000", org:"Boren Awards", url:"https://www.borenawards.org/", tags:["Language","National Security"], blurb:"Supports study abroad in critical languages and regions tied to public service."},
  {id:"s50", title:"Point Foundation BIPOC Scholarship", amount:"Varies", org:"Point Foundation", url:"https://pointfoundation.org/scholarships/bipoc/", tags:["BIPOC","Leadership"], blurb:"Supports LGBTQ and BIPOC student leaders pursuing higher education."},

  {id:"s51", title:"NAACP Scholarships", amount:"Varies", org:"NAACP", url:"https://naacp.org/find-resources/scholarships-awards-internships/scholarships", tags:["Black Students","Civil Rights"], blurb:"Scholarship hub for students connected to leadership, justice, and education."},
  {id:"s52", title:"NAACP Agnes Jones Jackson Scholarship", amount:"Varies", org:"NAACP", url:"https://naacp.org/find-resources/scholarships-awards-internships/scholarships", tags:["NAACP Members","College"], blurb:"Scholarship opportunity for NAACP members pursuing undergraduate or graduate education."},
  {id:"s53", title:"NAACP Creative Sole Scholarship", amount:"Varies", org:"NAACP", url:"https://naacp.org/find-resources/scholarships-awards-internships/scholarships", tags:["Creative","Black Students"], blurb:"Supports creative students using talent, culture, and vision to shape the future."},
  {id:"s54", title:"CBC Spouses Education Scholarship", amount:"Varies", org:"Congressional Black Caucus Foundation", url:"https://www.cbcfinc.org/programs/scholarships/", tags:["Black Students","Leadership"], blurb:"Scholarship for academically talented and civically engaged students."},
  {id:"s55", title:"CBC Spouses Visual Arts Scholarship", amount:"Varies", org:"CBC Foundation", url:"https://www.cbcfinc.org/programs/scholarships/", tags:["Art","Creative"], blurb:"Supports students pursuing visual arts and creative disciplines."},
  {id:"s56", title:"CBC Spouses Performing Arts Scholarship", amount:"Varies", org:"CBC Foundation", url:"https://www.cbcfinc.org/programs/scholarships/", tags:["Performing Arts","Creative"], blurb:"Supports students pursuing theater, music, dance, and performance."},
  {id:"s57", title:"CBC Ally Financial Law Scholars", amount:"Varies", org:"CBC Foundation", url:"https://www.cbcfinc.org/programs/scholarships/", tags:["Law","Leadership"], blurb:"Supports students pursuing legal education and civic leadership."},
  {id:"s58", title:"National Black MBA Association Scholarships", amount:"Varies", org:"NBMBAA", url:"https://nbmbaa.org/scholarships/", tags:["Business","MBA"], blurb:"Scholarships for Black business students and future executives."},
  {id:"s59", title:"NABA National Scholarship", amount:"Varies", org:"NABA Inc.", url:"https://nabainc.org/scholarships/", tags:["Accounting","Finance"], blurb:"Scholarships for Black students pursuing accounting, finance, and business careers."},
  {id:"s60", title:"NABA CPA Bound Scholarship", amount:"Varies", org:"NABA Inc.", url:"https://nabainc.org/scholarships/", tags:["CPA","Accounting"], blurb:"Supports future Black CPAs and accounting professionals."},

  {id:"s61", title:"Management Leadership for Tomorrow Career Prep", amount:"Program support", org:"MLT", url:"https://mlt.org/career-prep/", tags:["Career","Leadership"], blurb:"Career acceleration program for underrepresented college students."},
  {id:"s62", title:"SEO Scholars", amount:"Program support", org:"SEO", url:"https://www.seo-usa.org/scholars/", tags:["College Access","High School"], blurb:"Academic and college access program supporting ambitious public high school students."},
  {id:"s63", title:"Posse Foundation Scholarship", amount:"Full tuition", org:"Posse Foundation", url:"https://www.possefoundation.org/recruiting-students/the-scholarship", tags:["Leadership","Full Tuition"], blurb:"Full-tuition leadership scholarship through partner colleges and universities."},
  {id:"s64", title:"QuestBridge National College Match", amount:"Full four-year scholarship", org:"QuestBridge", url:"https://www.questbridge.org/high-school-students/national-college-match", tags:["Low Income","Full Ride"], blurb:"Connects high-achieving low-income students with full scholarships to top colleges."},
  {id:"s65", title:"College Board BigFuture Scholarships", amount:"Up to $40,000", org:"College Board", url:"https://bigfuture.collegeboard.org/pay-for-college/bigfuture-scholarships", tags:["College Planning","High School"], blurb:"Monthly scholarship drawings tied to college planning steps."},
  {id:"s66", title:"Sallie Mae Scholarships", amount:"Varies", org:"Sallie Mae", url:"https://www.salliemae.com/scholarships/", tags:["Scholarship Search"], blurb:"Scholarship search platform and scholarship opportunities for students."},
  {id:"s67", title:"Fastweb Scholarships", amount:"Varies", org:"Fastweb", url:"https://www.fastweb.com/", tags:["Scholarship Search"], blurb:"Scholarship search database for students across majors and backgrounds."},
  {id:"s68", title:"Bold.org Black Student Scholarships", amount:"Varies", org:"Bold.org", url:"https://bold.org/scholarships/by-demographics/minorities/black-students-scholarships/", tags:["Black Students","Scholarship Search"], blurb:"Scholarship marketplace with awards specifically for Black students."},
  {id:"s69", title:"Scholarships.com African American Scholarships", amount:"Varies", org:"Scholarships.com", url:"https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory/race/african-american", tags:["Black Students","Database"], blurb:"Scholarship directory for African American students across the U.S."},
  {id:"s70", title:"Going Merry Scholarships", amount:"Varies", org:"Going Merry", url:"https://www.goingmerry.com/", tags:["Scholarship Search"], blurb:"Scholarship application platform that helps students find and apply for awards."},

  {id:"s71", title:"Appily Scholarships", amount:"Varies", org:"Appily", url:"https://www.appily.com/scholarships", tags:["Scholarship Search"], blurb:"Scholarship search tool for college-bound and current college students."},
  {id:"s72", title:"HBCU Connect Scholarships", amount:"Varies", org:"HBCU Connect", url:"https://hbcuconnect.com/scholarships/", tags:["HBCU","Black Students"], blurb:"Scholarships, internships, and opportunities for HBCU students and alumni."},
  {id:"s73", title:"HBCU Week Scholarships", amount:"Varies", org:"HBCU Week Foundation", url:"https://www.hbcuweek.org/scholarships", tags:["HBCU","College Access"], blurb:"Supports students interested in attending HBCUs."},
  {id:"s74", title:"Tom Joyner Foundation Scholarships", amount:"Varies", org:"Tom Joyner Foundation", url:"https://tomjoynerfoundation.org/scholarships/", tags:["HBCU","Black Students"], blurb:"Scholarships supporting students attending historically Black colleges and universities."},
  {id:"s75", title:"BeyGOOD Scholarships", amount:"Varies", org:"BeyGOOD", url:"https://beygood.org/", tags:["Creative","Entrepreneurship"], blurb:"Beyoncé’s philanthropic initiative supporting students, entrepreneurs, and communities."},
  {id:"s76", title:"Shawn Carter Foundation Scholarship", amount:"Varies", org:"Shawn Carter Foundation", url:"https://www.shawncartersf.com/scholarship-fund/", tags:["Need Based","Leadership"], blurb:"Scholarship for motivated students facing financial barriers to higher education."},
  {id:"s77", title:"Live Más Scholarship", amount:"$5,000–$25,000", org:"Taco Bell Foundation", url:"https://www.tacobellfoundation.org/live-mas-scholarship/", tags:["Creative","Passion"], blurb:"For students pursuing bold passions, creative ideas, and nontraditional dreams."},
  {id:"s78", title:"Foot Locker Scholar Athletes", amount:"$20,000", org:"Foot Locker Foundation", url:"https://www.footlockerscholarathletes.com/", tags:["Athletes","Leadership"], blurb:"Recognizes student-athletes who demonstrate leadership, excellence, and community impact."},
  {id:"s79", title:"Chick-fil-A Remarkable Futures Scholarship", amount:"Up to $25,000", org:"Chick-fil-A", url:"https://www.chick-fil-a.com/remarkable-futures-scholarships", tags:["Employees","College"], blurb:"Scholarships for Chick-fil-A team members pursuing higher education."},
  {id:"s80", title:"KFC Foundation Scholarships", amount:"Varies", org:"KFC Foundation", url:"https://kfcfoundation.org/scholarships/", tags:["Employees","College"], blurb:"Education support for eligible KFC restaurant employees."},

  {id:"s81", title:"Davidson Fellows Scholarship", amount:"Up to $50,000", org:"Davidson Institute", url:"https://www.davidsongifted.org/gifted-programs/fellows-scholarship/", tags:["Young Innovators","STEM","Creative"], blurb:"Major award for students 18 or younger who complete significant projects."},
  {id:"s82", title:"Regeneron Science Talent Search", amount:"Up to $250,000", org:"Society for Science", url:"https://www.societyforscience.org/regeneron-sts/", tags:["Research","STEM"], blurb:"Prestigious science research competition for high school seniors."},
  {id:"s83", title:"Thermo Fisher Scientific Antibody Scholarship", amount:"Up to $10,000", org:"Thermo Fisher Scientific", url:"https://www.thermofisher.com/us/en/home/life-science/antibodies/antibodies-learning-center/antibodies-scholarship-program.html", tags:["Life Science","STEM"], blurb:"Scholarship for students pursuing life science education."},
  {id:"s84", title:"Paradigm Challenge", amount:"Up to $100,000", org:"Project Paradigm", url:"https://www.projectparadigm.org/", tags:["Innovation","Youth"], blurb:"Youth innovation challenge encouraging students to solve real-world problems."},
  {id:"s85", title:"Conrad Challenge", amount:"Varies", org:"Conrad Foundation", url:"https://www.conradchallenge.org/", tags:["Entrepreneurship","Innovation"], blurb:"Student entrepreneurship competition for innovative products and ventures."},
  {id:"s86", title:"Diamond Challenge", amount:"Varies", org:"University of Delaware", url:"https://diamondchallenge.org/", tags:["High School","Entrepreneurship"], blurb:"Global entrepreneurship competition for high school students."},
  {id:"s87", title:"Rise Global Challenge", amount:"Lifetime benefits", org:"Rise", url:"https://www.risefortheworld.org/apply-to-rise/", tags:["Global","Youth","Leadership"], blurb:"Global program supporting young people with talent, purpose, and bold ideas."},
  {id:"s88", title:"Gloria Barron Prize for Young Heroes", amount:"$10,000", org:"Barron Prize", url:"https://barronprize.org/apply/", tags:["Youth","Service"], blurb:"Recognizes young leaders making a meaningful difference in communities."},
  {id:"s89", title:"Prudential Emerging Visionaries", amount:"Up to $15,000", org:"Prudential", url:"https://www.prudential.com/links/about/emergingvisionaries", tags:["Social Impact","Youth"], blurb:"Awards young people creating solutions to financial and societal challenges."},
  {id:"s90", title:"Equitable Excellence Scholarship", amount:"Up to $20,000", org:"Equitable Foundation", url:"https://equitable.com/foundation/equitable-excellence-scholarship", tags:["Leadership","College"], blurb:"Supports students showing ambition, determination, and community impact."},

  {id:"s91", title:"Elks Most Valuable Student Scholarship", amount:"Up to $30,000", org:"Elks National Foundation", url:"https://www.elks.org/scholars/scholarships/mvs.cfm", tags:["High School","Leadership"], blurb:"National scholarship for high school seniors based on leadership, academics, and financial need."},
  {id:"s92", title:"Davis-Putter Scholarship Fund", amount:"Up to $15,000", org:"Davis-Putter Scholarship Fund", url:"https://www.davisputter.org/apply-for-scholarships/", tags:["Justice","Activism"], blurb:"Supports students active in movements for social and economic justice."},
  {id:"s93", title:"Jeannette Rankin National Scholar Grant", amount:"Varies", org:"Jeannette Rankin Foundation", url:"https://rankinfoundation.org/for-students/", tags:["Women","Adult Learners"], blurb:"Supports women and nonbinary students age 35+ pursuing education."},
  {id:"s94", title:"Jeannette Rankin Emerge Grant", amount:"Varies", org:"Jeannette Rankin Foundation", url:"https://rankinfoundation.org/for-students/", tags:["Adult Learners","Education"], blurb:"Grant support for adult learners working toward college and career advancement."},
  {id:"s95", title:"Google Lime Scholarship", amount:"$10,000", org:"Lime Connect / Google", url:"https://www.limeconnect.com/programs/page/google-lime-scholarship", tags:["Disability","Computer Science"], blurb:"Supports students with disabilities pursuing computer science and technology degrees."},
  {id:"s96", title:"Lime Connect Pathways Scholarship", amount:"Varies", org:"Lime Connect", url:"https://www.limeconnect.com/programs", tags:["Disability","Career"], blurb:"Scholarship and career pathway opportunities for students with disabilities."},
  {id:"s97", title:"Out to Innovate Scholarships", amount:"Varies", org:"Out to Innovate", url:"https://www.outtoinnovate.org/scholarships", tags:["STEM","LGBTQ"], blurb:"Supports LGBTQ+ students pursuing STEM education and careers."},
  {id:"s98", title:"AISES Scholarships", amount:"Varies", org:"AISES", url:"https://www.aises.org/students/scholarships", tags:["STEM","Indigenous Students"], blurb:"Scholarships for Indigenous students pursuing STEM education."},
  {id:"s99", title:"SHPE Scholarships", amount:"Varies", org:"Society of Hispanic Professional Engineers", url:"https://www.shpe.org/scholarships", tags:["Engineering","STEM"], blurb:"Scholarships supporting Hispanic students in STEM and engineering."},
  {id:"s100", title:"ColorStack Student Opportunities", amount:"Varies", org:"ColorStack", url:"https://www.colorstack.org/", tags:["Black CS Students","Community","Tech"], blurb:"Community and opportunity platform supporting Black and Latinx computer science students."}
];

const seedMentors = [
  {
    id:"m1",
    name:"Dr. Ayanna Fields",
    focus:"startup",
    title:"Founder & Product Lead",
    org:"HealthTech Studio",
    campus:"NC A&T alum",
    bio:"Former HBCU student now leading a seed-funded HealthTech startup focused on Black maternal health.",
    topics:["Startups","Product","Fundraising"],
    format:"30-min virtual office hours",
    maxMentees: 3,
    filledMentees: 2
  },
  {
    id:"m2",
    name:"Jordan “J” Kelley",
    focus:"media",
    title:"Creative Director",
    org:"Storyhouse Media",
    campus:"Howard alum",
    bio:"Leads branded content campaigns and podcasts amplifying Black stories in tech, sports, and culture.",
    topics:["Content","Storytelling","Brand"],
    format:"Portfolio & pitch feedback",
    maxMentees: 4,
    filledMentees: 1
  },
  {
    id:"m3",
    name:"Imani Okafor",
    focus:"tech",
    title:"Senior Software Engineer",
    org:"Major Tech Co.",
    campus:"Spelman alum",
    bio:"Back-end engineer and mentor for students breaking into software engineering from non-traditional paths.",
    topics:["Software","Interviews","Internships"],
    format:"Mock interviews & roadmap",
    maxMentees: 3,
    filledMentees: 3
  },
  {
    id:"m4",
    name:"Marcus Tate",
    focus:"career",
    title:"Innovation Program Manager",
    org:"Corporate Innovation Lab",
    campus:"FAMU alum",
    bio:"Runs internal accelerator programs and helps early-career talent turn rough ideas into pilots.",
    topics:["Corporate innovation","Career navigation"],
    format:"Career strategy sessions",
    maxMentees: 5,
    filledMentees: 3
  },
  {
    id:"m5",
    name:"Selena Brooks",
    focus:"startup",
    title:"Venture Scout",
    org:"Early-stage VC Fund",
    campus:"Howard alum",
    bio:"Helps founders at HBCUs prepare for their first meetings with investors.",
    topics:["Pitching","Deck review","Fundraising"],
    format:"Office hours during the semester",
    maxMentees: 2,
    filledMentees: 1
  },
  {
    id:"m6",
    name:"Desmond Cole",
    focus:"tech",
    title:"Cloud Architect",
    org:"Major Cloud Company",
    campus:"NC A&T alum",
    bio:"Designs large-scale cloud systems and mentors students exploring DevOps and infrastructure.",
    topics:["Cloud","DevOps","Career pathways"],
    format:"1:1 chats and group Q&A",
    maxMentees: 4,
    filledMentees: 2
  },
  {
    id:"m7",
    name:"Tiana Rivers",
    focus:"media",
    title:"Producer & Showrunner",
    org:"Multiplatform Studio",
    campus:"Spelman alum",
    bio:"Produces digital series highlighting Black innovation in sports, business, and culture.",
    topics:["Producing","On-camera presence","Story development"],
    format:"Portfolio feedback & project advice",
    maxMentees: 3,
    filledMentees: 2
  }
];

const seedProjects = [
  {
    id:"pr1",
    name:"SafeWalk A&T",
    campus:"North Carolina A&T",
    stage:"prototype",
    tags:["Safety","Mobile App"],
    desc:"Student-led night walk companion app that pairs walking buddies and shares routes with trusted contacts.",
    needs:"Designer for V2 screens, iOS dev mentor."
  },
  {
    id:"pr2",
    name:"Dormside Groceries",
    campus:"Howard University",
    stage:"idea",
    tags:["Food Access","Logistics"],
    desc:"Group-order grocery service where students pool orders for cheaper delivery to campus.",
    needs:"Operations-minded cofounder + no-code builder."
  },
  {
    id:"pr3",
    name:"Studio Sundays",
    campus:"Spelman College / Morehouse College",
    stage:"launch",
    tags:["Media","Community"],
    desc:"Weekly recording sessions for student creators to batch content, share gear, and cross-promote.",
    needs:"Sponsorships + video editing volunteers."
  },
  {
    id:"pr4",
    name:"Green Dorm Dashboards",
    campus:"FAMU",
    stage:"idea",
    tags:["Clean Energy","Behavior Change"],
    desc:"Simple dashboards showing each dorm’s energy and water usage with monthly challenges.",
    needs:"Data viz help + hardware mentor."
  },
  {
    id:"pr5",
    name:"HBCU Innovators Map",
    campus:"Multi-campus",
    stage:"prototype",
    tags:["Mapping","Community"],
    desc:"Interactive map of student-led projects and labs across HBCUs.",
    needs:"Front-end dev + storytellers to write project spotlights."
  },
  {
    id:"pr6",
    name:"Care Package Co-op",
    campus:"Morgan State University",
    stage:"launch",
    tags:["E-commerce","Community"],
    desc:"Student-run care package service where families can send themed boxes sourced from Black-owned brands.",
    needs:"Marketing partners + local vendors."
  }
];

const playbookGuides = [
  {
    id:"pb1",
    title:"Forming Your First LLC as a Student",
    tag:"LLC",
    length:"5 min read",
    bullets:[
      "Decide if you actually need an LLC yet—if you’re just prototyping, you may not.",
      "If you do, choose a simple name you can live with for a few years.",
      "Compare your home state vs. your school state for fees and rules.",
      "Use your school’s legal clinic or a local small business center if possible.",
      "Keep business money separate from personal money from day one."
    ],
    callout:"Your paperwork doesn’t make you a founder—your consistency does. The LLC just protects what you’re building."
  },
  {
    id:"pb2",
    title:"A 5-Slide Pitch Deck That Actually Works",
    tag:"Pitch",
    length:"4 min read",
    bullets:[
      "Slide 1: One clear sentence of the problem in your community.",
      "Slide 2: Your solution in plain language—no buzzwords.",
      "Slide 3: Who you’re serving and why you understand them.",
      "Slide 4: Proof: pilots, signups, letters of intent, or lived experience.",
      "Slide 5: Your specific ask: amount, type of support, or next step."
    ],
    callout:"If your grandma and a VC can both understand your slides, you’re on the right track."
  },
  {
    id:"pb3",
    title:"Protecting Your Idea: IP Basics for Campus Innovators",
    tag:"IP",
    length:"6 min read",
    bullets:[
      "Document your work: dates, drafts, and who contributed.",
      "Read your university’s IP policy—especially if you use campus labs.",
      "Trademarks protect names/logos, patents protect inventions, and copyright protects creative work.",
      "Sometimes speed and community are better than secrecy: pick a strategy.",
      "Talk to a pro before signing away rights in a contest or program."
    ],
    callout:"Your idea is bigger than one feature—protect the core, but keep experimenting."
  },
  {
    id:"pb4",
    title:"Building a Tiny but Mighty Team",
    tag:"Team",
    length:"4 min read",
    bullets:[
      "Write a one-page vision so everyone knows why this exists.",
      "Define roles by strengths, not just titles—designer, storyteller, connector, operator.",
      "Start with a 6-week experiment instead of a forever commitment.",
      "Schedule one weekly check-in with honest check-ups: wins, blockers, needs.",
      "Make it fun: celebrate progress, not just big milestones."
    ],
    callout:"The right three people with a clear rhythm can out-build a 30-person unfocused team."
  },
  {
    id:"pb5",
    title:"Landing Your First Internship",
    tag:"Career",
    length:"5 min read",
    bullets:[
      "Write a simple one-page resume that focuses on projects and impact, not just classes.",
      "Use your campus orgs (NSAAI, NSBE, SWE, etc.) to meet recruiters and alumni.",
      "Apply to roles even if you don’t meet 100% of the requirements.",
      "Ask mentors and older students to review your resume and LinkedIn.",
      "Treat every coffee chat like an informal interview: be curious and prepared."
    ],
    callout:"The first yes is often the hardest. After that, you’re building momentum."
  },
  {
    id:"pb6",
    title:"Running a Small but Powerful Pilot",
    tag:"Pilot",
    length:"4 min read",
    bullets:[
      "Start with 5–10 users you know you can reach personally.",
      "Define one clear success metric before you start (retention, satisfaction, etc.).",
      "Keep the tech light: forms, no-code tools, and manual ops are fine.",
      "Collect quotes, screenshots, and stories during the pilot.",
      "Use the learnings to decide: pause, pivot, or scale."
    ],
    callout:"Pilots are experiments, not verdicts. Their job is to teach you what to do next."
  }
];

playbookGuides.push(
  {
    id:"pb7",
    title:"How to Validate an Idea Before You Build",
    tag:"Validation",
    length:"5 min read",
    bullets:[
      "Write the problem in one sentence.",
      "Ask 10 real people if they experience that problem.",
      "Do not pitch first—listen first.",
      "Look for repeated words, pain points, and emotions.",
      "Build only after you see a pattern."
    ],
    callout:"Validation keeps you from building something people admire but never use."
  },
  {
    id:"pb8",
    title:"Creating a Simple MVP",
    tag:"MVP",
    length:"4 min read",
    bullets:[
      "Start with one core problem.",
      "Build the smallest version that proves the idea.",
      "Use no-code tools, forms, mockups, or manual steps.",
      "Test with a small group.",
      "Improve based on real feedback."
    ],
    callout:"An MVP is not supposed to be perfect. It is supposed to teach you fast."
  },
  {
    id:"pb9",
    title:"How to Find Your First 10 Users",
    tag:"Users",
    length:"4 min read",
    bullets:[
      "Start with people closest to the problem.",
      "Post in campus groups, group chats, and communities.",
      "Ask for feedback, not just signups.",
      "Follow up personally.",
      "Track who uses it more than once."
    ],
    callout:"Your first users are not numbers. They are your first believers."
  },
  {
    id:"pb10",
    title:"Naming Your Idea or Company",
    tag:"Brand",
    length:"3 min read",
    bullets:[
      "Make it easy to say and remember.",
      "Check if the domain and social handles are available.",
      "Search trademarks before getting attached.",
      "Avoid names that limit future growth.",
      "Choose a name that carries energy and meaning."
    ],
    callout:"A strong name makes people curious before you explain anything."
  },
  {
    id:"pb11",
    title:"How to Talk About Your Idea Clearly",
    tag:"Messaging",
    length:"4 min read",
    bullets:[
      "Say who it helps.",
      "Say what problem it solves.",
      "Say why it matters now.",
      "Avoid too many features at first.",
      "End with a simple invitation."
    ],
    callout:"Clarity is a superpower. If people understand it, they can support it."
  },
  {
    id:"pb12",
    title:"Finding a Co-Founder the Smart Way",
    tag:"Co-Founder",
    length:"5 min read",
    bullets:[
      "Look for character before talent.",
      "Start with a short test project.",
      "Discuss ownership early.",
      "Talk about time commitment honestly.",
      "Make sure your values align."
    ],
    callout:"A co-founder is not just a teammate. They are someone you build pressure with."
  },
  {
    id:"pb13",
    title:"Using AI as an Innovation Assistant",
    tag:"AI",
    length:"4 min read",
    bullets:[
      "Use AI to brainstorm, organize, and simplify.",
      "Ask it to challenge your assumptions.",
      "Do not copy blindly—add your lived experience.",
      "Use AI to create drafts, not final truth.",
      "Protect private or sensitive ideas."
    ],
    callout:"AI can speed you up, but your perspective is still the secret ingredient."
  },
  {
    id:"pb14",
    title:"How to Prepare for a Mentor Meeting",
    tag:"Mentors",
    length:"4 min read",
    bullets:[
      "Come with one clear goal.",
      "Share what you already tried.",
      "Ask specific questions.",
      "Take notes during the meeting.",
      "Follow up with gratitude and progress."
    ],
    callout:"Mentors help more when they can see that you are serious."
  },
  {
    id:"pb15",
    title:"Creating a Simple Innovation Budget",
    tag:"Budget",
    length:"4 min read",
    bullets:[
      "List what you need to test the idea.",
      "Separate must-haves from nice-to-haves.",
      "Use free tools first.",
      "Track every dollar spent.",
      "Tie spending to learning or growth."
    ],
    callout:"A smart budget protects your idea from running out of energy too early."
  },
  {
    id:"pb16",
    title:"How to Build in Public Without Oversharing",
    tag:"Build",
    length:"5 min read",
    bullets:[
      "Share your progress, not every private detail.",
      "Show lessons, milestones, and behind-the-scenes moments.",
      "Avoid revealing secret processes or sensitive strategy.",
      "Give credit to collaborators.",
      "Use public updates to attract support."
    ],
    callout:"Build in public with wisdom. Visibility is powerful when paired with protection."
  },
  {
    id:"pb17",
    title:"Getting Sponsorship for a Student Idea",
    tag:"Sponsorship",
    length:"5 min read",
    bullets:[
      "Identify companies aligned with your mission.",
      "Explain who your idea reaches.",
      "Offer simple sponsor benefits.",
      "Start with a small ask.",
      "Follow up with results and appreciation."
    ],
    callout:"Sponsors support momentum. Show them the impact they can be part of."
  },
  {
    id:"pb18",
    title:"Turning a Class Project Into a Real Product",
    tag:"Product",
    length:"5 min read",
    bullets:[
      "Ask if the problem exists beyond the classroom.",
      "Save your research, designs, and feedback.",
      "Check university ownership rules.",
      "Test it with users outside your class.",
      "Create a simple next-step roadmap."
    ],
    callout:"Some of the best companies start as assignments that someone refused to leave on paper."
  },
  {
    id:"pb19",
    title:"How to Protect Team Trust",
    tag:"Trust",
    length:"4 min read",
    bullets:[
      "Communicate expectations early.",
      "Put important decisions in writing.",
      "Give credit clearly and often.",
      "Address conflict directly but respectfully.",
      "Do not let confusion become resentment."
    ],
    callout:"Trust is innovation infrastructure. Without it, even great ideas break down."
  },
  {
    id:"pb20",
    title:"Launching Your First Landing Page",
    tag:"Launch",
    length:"4 min read",
    bullets:[
      "Use a headline that explains the value quickly.",
      "Add who it is for.",
      "Show the problem and solution.",
      "Include one clear call-to-action.",
      "Collect emails before building too much."
    ],
    callout:"A landing page turns your idea from private thought into public signal."
  }
);

const wellnessAffirmations = [
  "I am not behind. I am building at my own divine pace.",
  "My ideas are worthy of space, time, and support.",
  "I can honor my mental health and still be wildly ambitious.",
  "I come from brilliance. Innovation is in my lineage.",
  "Rest is part of the work. Pausing is not quitting.",
  "Even on quiet days, I am still becoming who I’m meant to be.",
  "My creativity flows naturally and effortlessly.",
  "I trust the vision placed on my heart.",
  "Every small step I take is progress.",
  "My mind is clear, focused, and powerful.",
  "I am capable of building something meaningful.",
  "The work I do today will create opportunities tomorrow.",
  "My ideas have the power to impact lives.",
  "I welcome inspiration wherever it appears.",
  "I am resilient, resourceful, and ready for growth.",
  "Each challenge is shaping me into a stronger innovator.",
  "I believe deeply in my potential.",
  "My voice and perspective matter.",
  "I am allowed to dream bigger than I ever have before.",
  "Today I will create, learn, and grow.",
  "My energy attracts positive opportunities.",
  "I am building something that will matter.",
  "I trust the timing of my journey.",
  "My purpose is greater than my doubts.",
  "I choose progress over perfection.",
  "I am surrounded by possibilities.",
  "My determination is stronger than any obstacle.",
  "The work I do is planting seeds for the future.",
  "I honor my journey and celebrate my growth.",
  "Every day I am becoming a better creator and thinker.",
  "I am aligned with creativity, purpose, and impact.",
  "The world needs the ideas that only I can bring."
];

const bibleVerses = [
  {
    ref: "Jeremiah 29:11",
    text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future."
  },
  {
    ref: "Philippians 4:13",
    text: "I can do all things through Christ who strengthens me."
  },
  {
    ref: "Proverbs 3:5-6",
    text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to Him, and He will make your paths straight."
  },
  {
    ref: "Isaiah 40:31",
    text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles."
  },
  {
    ref: "Romans 8:28",
    text: "And we know that in all things God works for the good of those who love Him, who have been called according to His purpose."
  },
  {
    ref: "Psalm 46:5",
    text: "God is within her, she will not fall; God will help her at break of day."
  },
  {
    ref: "Joshua 1:9",
    text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go."
  },
  {
    ref: "Psalm 23:1",
    text: "The Lord is my shepherd, I lack nothing."
  },
  {
    ref: "Matthew 19:26",
    text: "With man this is impossible, but with God all things are possible."
  },
  {
    ref: "2 Timothy 1:7",
    text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind."
  },
  {
    ref: "Psalm 34:8",
    text: "Taste and see that the Lord is good; blessed is the one who takes refuge in Him."
  },
  {
    ref: "Psalm 121:1-2",
    text: "I lift up my eyes to the mountains—where does my help come from? My help comes from the Lord, the Maker of heaven and earth."
  },
  {
    ref: "Romans 15:13",
    text: "May the God of hope fill you with all joy and peace as you trust in Him."
  },
  {
    ref: "Deuteronomy 31:6",
    text: "Be strong and courageous. Do not be afraid or terrified, for the Lord your God goes with you; He will never leave you nor forsake you."
  },
  {
    ref: "Psalm 37:4",
    text: "Take delight in the Lord, and He will give you the desires of your heart."
  },
  {
    ref: "Isaiah 41:10",
    text: "So do not fear, for I am with you; do not be dismayed, for I am your God."
  },
  {
    ref: "Matthew 11:28",
    text: "Come to me, all you who are weary and burdened, and I will give you rest."
  },
  {
    ref: "Psalm 118:24",
    text: "This is the day the Lord has made; let us rejoice and be glad in it."
  },
  {
    ref: "1 Corinthians 16:14",
    text: "Do everything in love."
  },
  {
    ref: "Hebrews 11:1",
    text: "Now faith is confidence in what we hope for and assurance about what we do not see."
  },
  {
    ref: "Psalm 28:7",
    text: "The Lord is my strength and my shield; my heart trusts in Him, and He helps me."
  },
  {
    ref: "Proverbs 16:3",
    text: "Commit to the Lord whatever you do, and He will establish your plans."
  },
  {
    ref: "John 14:27",
    text: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled and do not be afraid."
  },
  {
    ref: "Lamentations 3:22-23",
    text: "His compassions never fail. They are new every morning; great is your faithfulness."
  },
  {
    ref: "Mark 9:23",
    text: "Everything is possible for one who believes."
  },
  {
    ref: "Psalm 27:1",
    text: "The Lord is my light and my salvation—whom shall I fear?"
  },
  {
    ref: "James 1:5",
    text: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault."
  },
  {
    ref: "Galatians 6:9",
    text: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up."
  },
  {
    ref: "Ephesians 3:20",
    text: "Now to Him who is able to do immeasurably more than all we ask or imagine."
  },
  {
    ref: "Psalm 91:11",
    text: "For He will command His angels concerning you to guard you in all your ways."
  }
];

let lastBibleVerseIndex = -1;

function showRandomBibleVerse(){
  const verseTextEl = $("#bibleVerseText");
  const verseRefEl = $("#bibleVerseRef");
  if (!verseTextEl || !verseRefEl || !bibleVerses.length) return;

  let nextIndex = Math.floor(Math.random() * bibleVerses.length);

  // avoid showing the exact same verse twice in a row
  if (bibleVerses.length > 1){
    while (nextIndex === lastBibleVerseIndex){
      nextIndex = Math.floor(Math.random() * bibleVerses.length);
    }
  }

  lastBibleVerseIndex = nextIndex;

  const verse = bibleVerses[nextIndex];
  verseTextEl.textContent = `“${verse.text}”`;
  verseRefEl.textContent = verse.ref;
}

/* =======================================================
   Storage / State
======================================================= */
const store = {
  get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)) }
};

// Demo-only local user storage.
// This keeps "Try the Demo" working without affecting real Firebase signups/logins.
function usersKey(){ 
  return "ns-users-v1"; 
}

function getUsers(){ 
  return store.get(usersKey(), []); 
}

function saveUsers(arr){ 
  store.set(usersKey(), arr); 
}

const STATE = {
  me:null,
  timerStart:null,
  cultureIndex:0,
  recsMode:false,
  lastSubpage:"home",
  calendarViewDate: new Date(),
  calendarSelectedDate: new Date(),
  calendarViewMode: "month"
};

const DEMO_INTEREST_KEY = "ns-demo-interest-v1";
const DEMO_POPUP_DISMISSED_KEY = "ns-demo-popup-dismissed-v1";

let demoInterestTimer = null;
let demoInterestHasShownThisSession = false;

const NS_PROFILE_PHOTO_DIALOG_ID = "profilePhotoDialog";
const NS_LOCKED_FEATURES = ["studio", "mentors", "projects"];

/* =======================================================
   Membership
======================================================= */
function membershipKey(){
  return STATE.me ? `ns-memberships-${STATE.me.id}` : "ns-memberships-demo";
}

function chapterInterestKey(){
  return STATE.me ? `ns-chapter-interest-${STATE.me.id}` : "ns-chapter-interest-demo";
}

function getMemberships(){
  return store.get(membershipKey(), []);
}

function saveMemberships(arr){
  store.set(membershipKey(), arr);
}

let LOCKED_FEATURE_TARGET = null;

function openLockedFeatureDialog(featureKey){
  const dlg = $("#lockedFeatureDialog");
  const title = $("#lockedFeatureTitle");
  const text = $("#lockedFeatureText");

  const niceName =
    featureKey === "studio" ? "Studio" :
    featureKey === "mentors" ? "Mentors" :
    featureKey === "projects" ? "Projects" :
    "This Feature";

  LOCKED_FEATURE_TARGET = featureKey;

  if (title) title.textContent = `Unlock ${niceName}`;
  if (text){
    text.textContent =
      `${niceName} is part of the NSAAI member experience. You can preview it now, but becoming a member unlocks the full power to create, connect, protect ideas, and build with purpose.`;
  }

  if (dlg) dlg.showModal();
}

function closeLockedFeatureDialog(){
  const dlg = $("#lockedFeatureDialog");
  if (dlg?.open) dlg.close();
}

function bindLockedFeatureDialogOnce(){
  const closeBtn = $("#lockedFeatureClose");
  const previewBtn = $("#lockedFeaturePreviewBtn");
  const joinBtn = $("#lockedFeatureJoinBtn");

  if (closeBtn && !closeBtn.dataset.bound){
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", closeLockedFeatureDialog);
  }

  if (previewBtn && !previewBtn.dataset.bound){
    previewBtn.dataset.bound = "1";
    previewBtn.addEventListener("click", () => {
      const target = LOCKED_FEATURE_TARGET;
      closeLockedFeatureDialog();
      if (target) subnav(target);
    });
  }

  if (joinBtn && !joinBtn.dataset.bound){
    joinBtn.dataset.bound = "1";
    joinBtn.addEventListener("click", () => {
      closeLockedFeatureDialog();
      goto("dashboard");
      subnav("membership");
    });
  }
}

function getChapterInterest(){
  return store.get(chapterInterestKey(), []);
}

function saveChapterInterest(arr){
  store.set(chapterInterestKey(), arr);
}

const MEMBERSHIP_PLANS = {
  highschool: {
    id: "highschool",
    title: "High School Membership",
    price: 30,
    term: "12 months",
    audience: "future innovators"
  },
  college: {
    id: "college",
    title: "College Membership",
    price: 50,
    term: "12 months",
    audience: "student builders and leaders"
  },
  professional: {
    id: "professional",
    title: "Professional Membership",
    price: 70,
    term: "12 months",
    audience: "professionals, mentors, and innovators"
  }
};

let ACTIVE_MEMBERSHIP_PLAN = null;

function renderMembership(){
  const page = $("#sub-membership");
  if (!page) return;

  const memberships = getMemberships();
  const activePlanId = memberships[0]?.planId || null;

  $$(".membership-pay-btn", page).forEach(btn => {
    const planId = btn.dataset.membership;
    const isActive = activePlanId === planId;

    btn.textContent = isActive
      ? `You Joined ${MEMBERSHIP_PLANS[planId]?.title || "Membership"}`
      : (
          planId === "highschool" ? "Join High School Membership" :
          planId === "college" ? "Join College Membership" :
          "Join Professional Membership"
        );

    btn.disabled = false;
  });
}

function openMembershipDialog(planId){
  const dlg = $("#membershipDialog");
  const successText = $("#membershipSuccessText");
  const chapterWrap = $("#chapterInterestWrap");
  const status = $("#chapterInterestStatus");
  const email = $("#chapterInterestEmail");
  const type = $("#chapterInterestType");
  const reason = $("#chapterInterestReason");

  if (!dlg) return;

  ACTIVE_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[planId] || null;

  if (successText && ACTIVE_MEMBERSHIP_PLAN){
    successText.textContent =
      `You are now part of the NSAAI family through the ${ACTIVE_MEMBERSHIP_PLAN.title}. Your annual membership helps unlock resources, community, events, leadership access, and the opportunity to start or join an official NSAAI chapter.`;
  }

  if (chapterWrap) chapterWrap.classList.add("hidden");
  if (status) status.textContent = "";
  if (type) type.value = "";
  if (reason) reason.value = "";
  if (email) email.value = STATE.me?.email || "";

  dlg.showModal();
}

function closeMembershipDialog(){
  const dlg = $("#membershipDialog");
  if (!dlg) return;
  dlg.close();
}

function showChapterInterestForm(){
  const wrap = $("#chapterInterestWrap");
  if (!wrap) return;
  wrap.classList.remove("hidden");
}

function saveMembershipPurchase(planId){
  const plan = MEMBERSHIP_PLANS[planId];
  if (!plan) return;

  const memberships = getMemberships();

  memberships.unshift({
    id: "membership-" + Date.now(),
    planId: plan.id,
    planTitle: plan.title,
    price: plan.price,
    term: plan.term,
    createdAt: new Date().toISOString()
  });

  saveMemberships(memberships);
}

function onMembershipPurchase(planId){
  saveMembershipPurchase(planId);
  renderMembership();
  openMembershipDialog(planId);
}

function onMembershipFormSubmit(e){
  e.preventDefault();

  const email = ($("#chapterInterestEmail")?.value || "").trim();
  const type = ($("#chapterInterestType")?.value || "").trim();
  const reason = ($("#chapterInterestReason")?.value || "").trim();
  const status = $("#chapterInterestStatus");

  if (!email || !type || !reason){
    if (status) status.textContent = "Please enter your email, select start or join, and share why you are interested.";
    return;
  }

  const submissions = getChapterInterest();
  submissions.unshift({
    id: "chapter-interest-" + Date.now(),
    membershipPlan: ACTIVE_MEMBERSHIP_PLAN?.title || "",
    email,
    interestType: type,
    reason,
    submittedAt: new Date().toISOString()
  });
  saveChapterInterest(submissions);

  if (status){
    status.textContent = "Your chapter interest was submitted successfully. NSAAI will contact you with more information.";
  }

  setTimeout(() => {
    closeMembershipDialog();
  }, 900);
}

function bindMembershipOnce(){
  const membershipPage = $("#sub-membership");
  if (!membershipPage || membershipPage.dataset.membershipBound === "1") return;
  membershipPage.dataset.membershipBound = "1";

  membershipPage.addEventListener("click", (e) => {
    const btn = e.target.closest(".membership-pay-btn");
    if (!btn) return;

    const planId = btn.dataset.membership;
    if (!planId) return;

    onMembershipPurchase(planId);
  });

  const dlg = $("#membershipDialog");
  const closeBtn = $("#membershipDialogClose");
  const yesBtn = $("#btnStartOrJoinChapterYes");
  const noBtn = $("#btnStartOrJoinChapterNo");
  const form = $("#membershipForm");

  if (closeBtn && !closeBtn.dataset.bound){
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", closeMembershipDialog);
  }

  if (yesBtn && !yesBtn.dataset.bound){
    yesBtn.dataset.bound = "1";
    yesBtn.addEventListener("click", showChapterInterestForm);
  }

  if (noBtn && !noBtn.dataset.bound){
    noBtn.dataset.bound = "1";
    noBtn.addEventListener("click", closeMembershipDialog);
  }

  if (form && !form.dataset.bound){
    form.dataset.bound = "1";
    form.addEventListener("submit", onMembershipFormSubmit);
  }

  if (dlg && !dlg.dataset.bound){
    dlg.dataset.bound = "1";
    dlg.addEventListener("cancel", () => {
      closeMembershipDialog();
    });
  }
}


const seedNotifications = [
  {
    id: "n1",
    icon: "🎉",
    title: "Your profile is 85% complete",
    text: "Add your portfolio link so mentors and collaborators can find your work faster.",
    time: "2m ago",
    unread: true
  },
  {
    id: "n2",
    icon: "🤝",
    title: "New connection opportunity",
    text: "Jordan from Howard matched with your interests in Product and AI.",
    time: "14m ago",
    unread: true
  },
  {
    id: "n3",
    icon: "📅",
    title: "Event reminder",
    text: "Innovation Study Sync starts tomorrow at 6:00 PM.",
    time: "1h ago",
    unread: true
  },
  {
    id: "n4",
    icon: "🚀",
    title: "Your community post is gaining traction",
    text: "5 people liked your latest update in the Community feed.",
    time: "3h ago",
    unread: false
  }
];


/* =======================================================
   Dashboard Home (NEW)
======================================================= */

function shuffleArray(arr){
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildFeaturedMock(){
  const menPool = shuffleArray(MEN_PHOTOS);
  const womenPool = shuffleArray(WOMEN_PHOTOS);
  let menIndex = 0;
  let womenIndex = 0;

  const base = [
    {
      name: "Aaliyah Carter",
      meta: "Building: SafeWalk A&T • 14 posts • 6 RSVPs",
      text: "Proud moment: our prototype just hit 120 beta users. Next: campus partnerships + mentor help."
    },
    {
      name: "Kwame Nelson",
      meta: "Building: Green Dorm Dashboards • 11 posts • 9 connections",
      text: "This week I mapped dorm energy patterns and turned it into a challenge students actually want to play."
    },
    {
      name: "Sanaa Mitchell",
      meta: "Building: Studio Sundays • 16 posts • 4 events hosted",
      text: "I’m celebrating consistency. We recorded 8 episodes in one weekend and gave 3 students their first platform."
    }
  ];

  return base.map((u) => {
    const gender = guessGenderFromFirstName(u.name);

    let avatarUrl = "";
    if (gender === "woman"){
      avatarUrl = womenPool[womenIndex % womenPool.length];
      womenIndex++;
    } else {
      avatarUrl = menPool[menIndex % menPool.length];
      menIndex++;
    }

    return {
      ...u,
      gender,
      avatarUrl
    };
  });
}

const featuredMock = buildFeaturedMock();

function renderHome(){
  const appHeader = $(".app-header");
  if (appHeader) appHeader.classList.add("hidden");

  if (!isDesktopMenuMode()){
    closeSideMenu();
  }

  syncSideMenuActive("home");
  syncSideProfile();

  const grid = $("#featuredGrid");
if (grid){
  grid.innerHTML = featuredMock.map(u => `
    <div class="featured-card">
      <div class="featured-card-top">
        <span class="avatar featured-avatar">
          ${
            u.avatarUrl
              ? `<img src="${sanitize(u.avatarUrl)}" alt="${sanitize(u.name)}" loading="lazy" />`
              : sanitize(initialBadge(u.name))
          }
        </span>

        <div class="featured-card-headings">
          <p class="fc-name">${sanitize(u.name)}</p>
          <p class="fc-meta">${sanitize(u.meta)}</p>
        </div>
      </div>

      <p class="fc-text">${sanitize(u.text)}</p>
    </div>
  `).join("");
}

  const menuBtn = $("#homeOpenMenuBtn");
  const profBtn = $("#homeProfileBtn");

  if (menuBtn && !menuBtn.dataset.bound){
    menuBtn.dataset.bound = "1";
    menuBtn.addEventListener("click", () => {
      openSideMenu();
    });
  }

  if (profBtn && !profBtn.dataset.bound){
    profBtn.dataset.bound = "1";
    profBtn.addEventListener("click", () => {
      goto("dashboard");
      subnav("profile");
    });
  }

  buildBottomNav("home");
}

/* =======================================================
   Bottom Nav (NEW) — Persistent + Customizable (Home required)
======================================================= */

const BOTTOM_NAV_KEY = "ns-bottom-nav-v1";
const BOTTOM_NAV_MIN_KEY = "ns-bottom-nav-minimized-v1";


// what can appear in the bottom bar (keep labels/icons simple)
const BOTTOM_NAV_OPTIONS = [
  { key:"friends",  label:"👥 Network" },
  { key:"feed",     label:"💬 Community" },
  { key:"calendar", label:"📅 Calendar" },
{ key:"studio",   label:"🔒 Studio" },
{ key:"projects", label:"🔒 Projects" },
  { key:"jobs",     label:"💼 Jobs" },
  { key:"scholarships", label:"🎓 Scholarships" },
  { key:"mentors",  label:"🔒 Mentors" },
  { key:"playbook", label:"📚 Playbook" },
  { key:"wellness", label:"🧘🏾 Wellness" },
  { key:"culture",  label:"🎴 Culture" },
  { key:"music",    label:"🎵 Music" },
  { key:"quests",   label:"🏆 Quests" },
  { key:"partners", label:"🤝 Partners" },
  { key:"campus",   label:"🗺️ Campus" },
  { key:"socials",  label:"🔗 Socials" },
  { key:"membership", label:"💠 Membership" }
];

const DEFAULT_BOTTOM_NAV = ["home","friends","feed","wellness","music"]; // Home required

function getBottomNavConfig(){
  const saved = store.get(BOTTOM_NAV_KEY, null);
  const blocked = new Set(["study", "profile"]);

  if (!Array.isArray(saved) || saved.length !== 5) return [...DEFAULT_BOTTOM_NAV];

  // remove blocked items from old saved configs
  const filtered = saved.filter(k => !blocked.has(k));

  // enforce: Home always present + 5 unique
  const uniq = Array.from(new Set(filtered));
  if (!uniq.includes("home")) uniq.unshift("home");

  while (uniq.length < 5) {
    for (const k of DEFAULT_BOTTOM_NAV){
      if (uniq.length >= 5) break;
      if (!blocked.has(k) && !uniq.includes(k)) uniq.push(k);
    }

    for (const o of BOTTOM_NAV_OPTIONS){
      if (uniq.length >= 5) break;
      if (!blocked.has(o.key) && !uniq.includes(o.key)) uniq.push(o.key);
    }
  }

  return uniq.slice(0,5);
}

function setBottomNavConfig(arr){
  store.set(BOTTOM_NAV_KEY, arr);
}

function isBottomNavMinimized(){
  return !!store.get(BOTTOM_NAV_MIN_KEY, false);
}

function setBottomNavMinimized(minimized){
  store.set(BOTTOM_NAV_MIN_KEY, !!minimized);

  const nav = $("#bottomNav");
  if (!nav) return;

  nav.classList.toggle("minimized", !!minimized);

  const toggle = nav.querySelector(".bottomnav-toggle");
  if (toggle){
    toggle.setAttribute(
      "aria-label",
      minimized ? "Expand bottom bar" : "Minimize bottom bar"
    );
    toggle.setAttribute(
      "title",
      minimized ? "Expand bottom bar" : "Minimize bottom bar"
    );
  }
}

function toggleBottomNavMinimized(){
  setBottomNavMinimized(!isBottomNavMinimized());
}

function ensureBottomNavElement(){
  let nav = $("#bottomNav");
  if (nav) return nav;

  nav = document.createElement("nav");
  nav.id = "bottomNav";
  nav.className = "bottom-nav"; // style in CSS
  document.body.appendChild(nav);
  return nav;
}

function ensureBottomNavToggle(nav){
  if (!nav) return null;

  let toggle = nav.querySelector(".bottomnav-toggle");
  if (toggle) return toggle;

  toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "bottomnav-toggle";
  toggle.id = "bottomNavToggle";
  toggle.setAttribute("aria-label", "Minimize bottom bar");
  toggle.setAttribute("title", "Minimize bottom bar");

  nav.prepend(toggle);
  return toggle;
}

function navLabel(key){
  if (key === "home") return "🏠 Home";
  const opt = BOTTOM_NAV_OPTIONS.find(o => o.key === key);
  return opt ? opt.label : key;
}

function buildBottomNav(activeKey){
  const dash = $("#page-dashboard");
  const onDashboard = dash && dash.classList.contains("active");

  const nav = ensureBottomNavElement();
  nav.classList.toggle("hidden", !onDashboard);

  if (!onDashboard) return;

  const config = getBottomNavConfig();
  let currentFromHash = "home";
  const parts = (location.hash || "").split("/");

  if (parts[1] === "dashboard" && parts[2]) currentFromHash = parts[2];

  const current = activeKey || currentFromHash || "home";

  nav.innerHTML = config.map(k => {
    const rawLabel = navLabel(k);
    const labelParts = rawLabel.split(" ");
    const icon = labelParts.shift() || "";
    const text = labelParts.join(" ") || rawLabel;

    return `
      <button class="bn-btn ${k === current ? "active" : ""}" data-bnav="${k}" type="button" aria-label="${sanitize(text)}">
        <span class="bn-icon" aria-hidden="true">${sanitize(icon)}</span>
        <span class="bn-text">${sanitize(text)}</span>
      </button>
    `;
  }).join("");

  const toggle = ensureBottomNavToggle(nav);

  if (toggle && !toggle.dataset.bound){
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBottomNavMinimized();
    });

    toggle.addEventListener("mouseenter", () => {
      nav.classList.add("toggle-hover");
    });

    toggle.addEventListener("mouseleave", () => {
      nav.classList.remove("toggle-hover");
    });
  }

  setBottomNavMinimized(isBottomNavMinimized());

  if (!nav.dataset.bound){
    nav.dataset.bound = "1";

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-bnav]");
      if (!btn) return;

      const key = btn.dataset.bnav;
      if (!key) return;

    goto("dashboard");

if (NS_LOCKED_FEATURES.includes(key)){
  openLockedFeatureDialog(key);
  subnav(key);
scrollAppToTop();
  buildBottomNav(key);
  return;
}

subnav(key);
buildBottomNav(key);
    });
  }
}

function openBottomNavDialog(){
  const dlg = $("#bottomNavDialog");
  const form = $("#bottomNavForm");
  if (!dlg || !form) return;

  const config = getBottomNavConfig(); // ["home", slot2, slot3, slot4, slot5]
  const selectKeys = ["slot2","slot3","slot4","slot5"];
  const selects = selectKeys.map(n => form.elements[n]).filter(Boolean);

  // build options list (exclude home from dropdown because it is required)
  const optionsHtml = BOTTOM_NAV_OPTIONS
    .filter(o => !["home","study","profile"].includes(o.key))
    .map(o => `<option value="${o.key}">${sanitize(o.label)}</option>`)
    .join("");

  selects.forEach((sel, idx) => {
    sel.innerHTML = optionsHtml;
    sel.value = config[idx+1] || DEFAULT_BOTTOM_NAV[idx+1];
  });

  dlg.showModal();
}

function saveBottomNavFromDialog(){
  const form = $("#bottomNavForm");
  const dlg  = $("#bottomNavDialog");
  if (!form || !dlg) return;

  const blocked = new Set(["study", "profile"]);

  const chosen = [
    "home",
    form.elements.slot2.value,
    form.elements.slot3.value,
    form.elements.slot4.value,
    form.elements.slot5.value
  ].filter(Boolean).filter(k => !blocked.has(k));

  const uniq = ["home"];
  for (let i = 1; i < chosen.length; i++){
    if (!uniq.includes(chosen[i])) uniq.push(chosen[i]);
  }

  while (uniq.length < 5){
    for (const o of BOTTOM_NAV_OPTIONS){
      if (uniq.length >= 5) break;
      if (o.key !== "home" && !blocked.has(o.key) && !uniq.includes(o.key)) uniq.push(o.key);
    }
  }

  setBottomNavConfig(uniq.slice(0,5));
  dlg.close();
  buildBottomNav("home");
}

function resetBottomNav(){
  setBottomNavConfig([...DEFAULT_BOTTOM_NAV]);
  buildBottomNav("home");
}


/* =======================================================
   Helpers
======================================================= */
function scrollAppToTop(){
  const appContent = $(".app-content");

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth"
  });

  if (appContent){
    appContent.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth"
    });
  }
}
function minutesSince(ts){ return Math.floor((Date.now()-ts)/60000) }
function initialBadge(name){ const parts=(name||"").trim().split(" "); return parts.length>1?(parts[0][0]+parts[1][0]).toUpperCase():(name||"")[0]?.toUpperCase()||"👤"; }
function sanitize(str=""){ return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function normalizeArea(str=""){
  return String(str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .trim();
}

function getMyLocation(){
  return STATE.me?.location || store.get("ns-profile-location-demo", "");
}

function isSameArea(a, b){
  const aa = normalizeArea(a);
  const bb = normalizeArea(b);
  if (!aa || !bb) return false;

  return aa.includes(bb) || bb.includes(aa);
}
function dataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

function formatDateKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonthYear(date){
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatLongDate(date){
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatEventDateTime(date){
  return new Intl.DateTimeFormat(undefined, {
    month:"numeric",
    day:"numeric",
    year:"numeric",
    hour:"numeric",
    minute:"2-digit"
  }).format(date);
}

function getCurrentCalendarUserId(){
  return STATE.me?.id || STATE.me?.uid || auth.currentUser?.uid || "demo-user";
}

function getCurrentCalendarUserName(){
  return STATE.me?.name || auth.currentUser?.email || "You";
}

function normalizeEventVisibility(ev){
  if (!ev.visibility) ev.visibility = "public";
  if (!ev.creatorId) ev.creatorId = "system";
  if (!ev.creatorName) ev.creatorName = ev.host || "NSAAI";
  return ev;
}

function canSeeCalendarEvent(ev){
  normalizeEventVisibility(ev);

  if (ev.visibility === "public") return true;

  return ev.creatorId === getCurrentCalendarUserId();
}

function getVisibleCalendarEvents(){
  return EVENTS_STATE
    .map(normalizeEventVisibility)
    .filter(canSeeCalendarEvent);
}

function resetEventVisibilityToggle(){
  const privateOption = $('#eventForm input[name="visibility"][value="private"]');
  if (privateOption) privateOption.checked = true;
}

function getEventsForDate(date){
  const key = formatDateKey(date);

  return getVisibleCalendarEvents().filter(ev => {
    const dt = new Date(ev.datetime);
    return formatDateKey(dt) === key;
  }).sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
}

function getMentorCapacityStatus(filled, max){
  if (filled >= max) return "full";
  if (filled >= Math.max(1, max - 1)) return "limited";
  return "open";
}

function getMentorCapacityLabel(filled, max){
  if (filled >= max) return "Full";
  if (filled >= Math.max(1, max - 1)) return "Limited";
  return "Open Spots";
}

/* =======================================================
   Demo Interest / Early Access Popup
======================================================= */

function getDemoInterestEntries(){
  return store.get(DEMO_INTEREST_KEY, []);
}

function saveDemoInterestEntries(arr){
  store.set(DEMO_INTEREST_KEY, arr);
}

function hasDismissedDemoPopup(){
  return sessionStorage.getItem(DEMO_POPUP_DISMISSED_KEY) === "1";
}

function markDemoPopupDismissed(){
  sessionStorage.setItem(DEMO_POPUP_DISMISSED_KEY, "1");
}

function clearDemoInterestTimer(){
  if (demoInterestTimer){
    clearTimeout(demoInterestTimer);
    demoInterestTimer = null;
  }
}

function openDemoInterestDialog(){
  const dlg = $("#demoInterestDialog");
  const status = $("#demoInterestStatus");
  const nameEl = $("#demoInterestName");
  const emailEl = $("#demoInterestEmail");

  if (!dlg) return;
  if (demoInterestHasShownThisSession) return;
  if (hasDismissedDemoPopup()) return;

  demoInterestHasShownThisSession = true;

  if (status) status.textContent = "";

  if (STATE.me){
    if (nameEl && !nameEl.value) nameEl.value = STATE.me.name || "";
    if (emailEl && !emailEl.value) emailEl.value = STATE.me.email || "";
  }

  dlg.showModal();
}

function closeDemoInterestDialog(markDismissed = true){
  const dlg = $("#demoInterestDialog");
  if (!dlg) return;

  if (markDismissed){
    markDemoPopupDismissed();
  }

  if (dlg.open) dlg.close();
}

function scheduleDemoInterestPopup(){
  clearDemoInterestTimer();

  if (demoInterestHasShownThisSession) return;
  if (hasDismissedDemoPopup()) return;

  demoInterestTimer = setTimeout(() => {
    const onDashboard = $("#page-dashboard")?.classList.contains("active");

    // Shows after Try Demo or when a logged-in user is inside the app
    if (!onDashboard) return;

    openDemoInterestDialog();
  }, 30000);
}
async function saveDemoInterestSubmission(name, email){
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  const entry = {
    name: cleanName,
    email: cleanEmail,
    source: "try-the-demo-popup",
    page: location.hash || "",
    userId: STATE.me?.uid || STATE.me?.id || null,
    userName: STATE.me?.name || "",
    userEmail: STATE.me?.email || "",
    createdAt: new Date().toISOString()
  };

  // Local backup
  const entries = getDemoInterestEntries();
  entries.unshift({
    id: "demo-interest-" + Date.now(),
    ...entry
  });
  saveDemoInterestEntries(entries);

  // Firebase save
  await addDoc(collection(db, "earlyAccessLeads"), {
    ...entry,
    createdAt: serverTimestamp()
  });
}

async function copyDemoLink(){
  const status = $("#demoInterestStatus");
  const link = `${window.location.origin}${window.location.pathname}#/home`;

  try{
    await navigator.clipboard.writeText(link);
    if (status) status.textContent = "Demo link copied. Send it to an innovator or two 🚀";
  }catch(err){
    if (status) status.textContent = "Couldn’t copy automatically. You can still copy the link from the address bar.";
  }
}

async function shareDemoLink(){
  const status = $("#demoInterestStatus");
  const link = `${window.location.origin}${window.location.pathname}#/home`;
  const shareData = {
    title: "NSAAI Demo",
    text: "Check out this NSAAI demo. If you're an innovator or future innovator, I think you'll like it.",
    url: link
  };

  try{
    if (navigator.share){
      await navigator.share(shareData);
      if (status) status.textContent = "Thanks for sharing the demo 💡";
    } else {
      await copyDemoLink();
    }
  }catch(err){
    // user may cancel share; don't show error unless needed
    if (err && err.name !== "AbortError"){
      if (status) status.textContent = "Sharing was interrupted. You can still copy the link instead.";
    }
  }
}

async function onDemoInterestSubmit(e){
  e.preventDefault();

  const nameEl = $("#demoInterestName");
  const emailEl = $("#demoInterestEmail");
  const status = $("#demoInterestStatus");
  const submitBtn = $("#demoInterestSubmit") || $("#demoInterestForm button[type='submit']");

  const name = (nameEl?.value || "").trim();
  const email = (emailEl?.value || "").trim().toLowerCase();

  if (!name || !email){
    if (status) status.textContent = "Please enter your full name and email to join early access.";
    return;
  }

  try{
    if (submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    if (status) status.textContent = "Saving your early access info...";

    await saveDemoInterestSubmission(name, email);

    if (status){
      status.textContent = "You’re on the early access list. We’ll keep you posted on launch 🚀";
    }

    markDemoPopupDismissed();

    setTimeout(() => {
      closeDemoInterestDialog(false);
      if (submitBtn){
        submitBtn.disabled = false;
        submitBtn.textContent = "Join Early Access";
      }
    }, 900);

  } catch (error){
    console.error("Early access save error:", error);

    if (status){
      status.textContent = "Something went wrong saving to Firebase. Please check your Firebase rules and try again.";
    }

    if (submitBtn){
      submitBtn.disabled = false;
      submitBtn.textContent = "Join Early Access";
    }
  }
}

function bindDemoInterestPopupOnce(){
  const dlg = $("#demoInterestDialog");
  const form = $("#demoInterestForm");
  const closeBtn = $("#demoInterestClose");
  const maybeLaterBtn = $("#demoInterestMaybeLater");
  const copyBtn = $("#demoInterestCopyLink");
  const shareBtn = $("#demoInterestShareBtn");
  const ctaDemo = $("#ctaDemo");

  if (ctaDemo && !ctaDemo.dataset.demoPopupBound){
    ctaDemo.dataset.demoPopupBound = "1";
    ctaDemo.addEventListener("click", () => {
      scheduleDemoInterestPopup();
    });
  }

  if (form && !form.dataset.demoPopupBound){
    form.dataset.demoPopupBound = "1";
    form.addEventListener("submit", onDemoInterestSubmit);
  }

  if (closeBtn && !closeBtn.dataset.demoPopupBound){
    closeBtn.dataset.demoPopupBound = "1";
    closeBtn.addEventListener("click", () => {
      closeDemoInterestDialog(true);
    });
  }

  if (maybeLaterBtn && !maybeLaterBtn.dataset.demoPopupBound){
    maybeLaterBtn.dataset.demoPopupBound = "1";
    maybeLaterBtn.addEventListener("click", () => {
      closeDemoInterestDialog(true);
    });
  }

  if (copyBtn && !copyBtn.dataset.demoPopupBound){
    copyBtn.dataset.demoPopupBound = "1";
    copyBtn.addEventListener("click", copyDemoLink);
  }

  if (shareBtn && !shareBtn.dataset.demoPopupBound){
    shareBtn.dataset.demoPopupBound = "1";
    shareBtn.addEventListener("click", shareDemoLink);
  }

  if (dlg && !dlg.dataset.demoPopupBound){
    dlg.dataset.demoPopupBound = "1";

    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDemoInterestDialog(true);
    });

    dlg.addEventListener("click", (e) => {
      const rect = dlg.getBoundingClientRect();
      const clickedInDialog =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!clickedInDialog){
        closeDemoInterestDialog(true);
      }
    });
  }
}


/* =======================================================
   Avatar Upload + Crop
======================================================= */
const AVATAR_MAX_SOURCE_SIZE = 2200;
const AVATAR_EXPORT_SIZE = 600;

const AVATAR_CROP_STATE = {
  open: false,
  rawDataUrl: "",
  preparedDataUrl: "",
  img: null,
  scale: 1,
  minScale: 1,
  maxScale: 3,
  x: 0,
  y: 0,
  baseWidth: 0,
  baseHeight: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  startX: 0,
  startY: 0
};


function getAvatarStorageKey(){
  return STATE.me ? `ns-avatar-${STATE.me.id}` : "ns-avatar-demo";
}

function getAvatarEls(){
  return {
    input: $("#avatarInput"),
    preview: $("#avatarPreview"),
    fallback: $("#avatarFallback"),
    previewWrap: $(".profile-avatar-preview"),
    chooseBtn: $("#chooseAvatarBtn"),
    removeBtn: $("#removeAvatarBtn"),
    hiddenCropped: $("#croppedAvatarData"),

    dialog: $("#avatarCropDialog"),
    cropImage: $("#avatarCropImage"),
    cropViewport: $("#avatarCropViewport"),
    zoomRange: $("#avatarZoomRange"),
    miniPreview: $("#avatarCropMiniPreview"),

    closeBtn: $("#avatarCropClose"),
    cancelBtn: $("#avatarCropCancel"),
    applyBtn: $("#avatarCropApply")
  };
}

function setAvatarPreview(src){
  const { preview, previewWrap } = getAvatarEls();
  if (!preview || !previewWrap) return;

  if (src){
    preview.src = src;
    previewWrap.classList.add("has-image");
  } else {
    preview.removeAttribute("src");
    previewWrap.classList.remove("has-image");
  }

  // top header avatar
  const meAvatar = $("#meInitial");
  if (meAvatar && STATE.me){
    if (src){
      meAvatar.innerHTML = `<img src="${src}" alt="Your profile photo" />`;
    } else {
      meAvatar.textContent = initialBadge(STATE.me.name || "NSAAI");
    }
  }

// side menu avatar/photo
const sideProfile = $(".side-profile");
const sideInitial = $("#sideMeInitial");
const sidePhoto = $("#sideMePhoto");

if (STATE.me){
  if (src){
    if (sidePhoto){
      sidePhoto.src = src;
      sidePhoto.classList.remove("hidden");
    }

    if (sideInitial){
      sideInitial.textContent = initialBadge(STATE.me.name || "NSAAI");
    }

    if (sideProfile){
      sideProfile.classList.add("has-photo");
    }
  } else {
    if (sidePhoto){
      sidePhoto.removeAttribute("src");
      sidePhoto.classList.add("hidden");
    }

    if (sideInitial){
      sideInitial.textContent = initialBadge(STATE.me.name || "NSAAI");
    }

    if (sideProfile){
      sideProfile.classList.remove("has-photo");
    }
  }
}

  // community composer avatar
  syncCommunityComposerAvatar();
}

async function fileToImage(file){
  const url = await dataURL(file);
  return loadImage(url);
}

function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function downscaleImageToDataUrl(img, maxSize = AVATAR_MAX_SOURCE_SIZE, quality = 0.92){
  const longestSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);

  if (longestSide <= maxSize){
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  }

  const scale = maxSize / longestSide;
  const w = Math.round((img.naturalWidth || img.width) * scale);
  const h = Math.round((img.naturalHeight || img.height) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}

function clampAvatarPosition(){
  const s = AVATAR_CROP_STATE;
  const viewport = s.viewportSize || 0;
  const drawW = s.baseWidth * s.scale;
  const drawH = s.baseHeight * s.scale;

  const minX = Math.min(0, viewport - drawW);
  const minY = Math.min(0, viewport - drawH);
  const maxX = 0;
  const maxY = 0;

  s.x = clamp(s.x, minX, maxX);
  s.y = clamp(s.y, minY, maxY);
}

function updateAvatarCropTransform(){
  const { cropImage, miniPreview } = getAvatarEls();
  const s = AVATAR_CROP_STATE;
  if (!cropImage) return;

  cropImage.style.width = `${s.baseWidth * s.scale}px`;
  cropImage.style.height = `${s.baseHeight * s.scale}px`;
  cropImage.style.left = `${s.x}px`;
  cropImage.style.top = `${s.y}px`;
  cropImage.style.transform = `translate(0, 0)`;

  if (miniPreview){
    miniPreview.src = exportCroppedAvatarDataUrl(180);
  }
}

function exportCroppedAvatarDataUrl(size = AVATAR_EXPORT_SIZE){
  const s = AVATAR_CROP_STATE;
  if (!s.img) return "";

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const viewport = s.viewportSize;
  const sourceScaleX = (s.img.naturalWidth || s.img.width) / (s.baseWidth * s.scale);
  const sourceScaleY = (s.img.naturalHeight || s.img.height) / (s.baseHeight * s.scale);

  const sx = Math.max(0, -s.x * sourceScaleX);
  const sy = Math.max(0, -s.y * sourceScaleY);
  const sw = Math.min(s.img.naturalWidth || s.img.width, viewport * sourceScaleX);
  const sh = Math.min(s.img.naturalHeight || s.img.height, viewport * sourceScaleY);

  ctx.drawImage(
    s.img,
    sx, sy, sw, sh,
    0, 0, size, size
  );

  return canvas.toDataURL("image/jpeg", 0.92);
}

function resetAvatarCropState(){
  AVATAR_CROP_STATE.open = false;
  AVATAR_CROP_STATE.rawDataUrl = "";
  AVATAR_CROP_STATE.preparedDataUrl = "";
  AVATAR_CROP_STATE.img = null;
  AVATAR_CROP_STATE.scale = 1;
  AVATAR_CROP_STATE.minScale = 1;
  AVATAR_CROP_STATE.maxScale = 3;
  AVATAR_CROP_STATE.x = 0;
  AVATAR_CROP_STATE.y = 0;
  AVATAR_CROP_STATE.baseWidth = 0;
  AVATAR_CROP_STATE.baseHeight = 0;
  AVATAR_CROP_STATE.dragging = false;
  AVATAR_CROP_STATE.dragStartX = 0;
  AVATAR_CROP_STATE.dragStartY = 0;
  AVATAR_CROP_STATE.startX = 0;
  AVATAR_CROP_STATE.startY = 0;
  AVATAR_CROP_STATE.viewportSize = 0;
}

function closeAvatarCropDialog(){
  const { dialog, input, zoomRange, cropImage, miniPreview } = getAvatarEls();
  if (dialog?.open) dialog.close();

  if (input) input.value = "";
  if (zoomRange) zoomRange.value = "1";
  if (cropImage){
    cropImage.removeAttribute("src");
    cropImage.style.width = "";
    cropImage.style.height = "";
    cropImage.style.left = "";
    cropImage.style.top = "";
    cropImage.style.transform = "";
  }
  if (miniPreview) miniPreview.removeAttribute("src");

  resetAvatarCropState();
}

async function openAvatarCropDialogFromFile(file){
  const { dialog, cropImage, cropViewport, zoomRange } = getAvatarEls();
  if (!dialog || !cropImage || !cropViewport || !zoomRange) return;

  const loaded = await fileToImage(file);
  const preparedDataUrl = downscaleImageToDataUrl(loaded, AVATAR_MAX_SOURCE_SIZE, 0.92);
  const preparedImg = await loadImage(preparedDataUrl);

  resetAvatarCropState();

  AVATAR_CROP_STATE.open = true;
  AVATAR_CROP_STATE.rawDataUrl = preparedDataUrl;
  AVATAR_CROP_STATE.preparedDataUrl = preparedDataUrl;
  AVATAR_CROP_STATE.img = preparedImg;

  cropImage.src = preparedDataUrl;

  dialog.showModal();

  requestAnimationFrame(() => {
    const rect = cropViewport.getBoundingClientRect();
    const viewportSize = Math.round(Math.min(rect.width, rect.height));

    AVATAR_CROP_STATE.viewportSize = viewportSize;

    const iw = preparedImg.naturalWidth || preparedImg.width;
    const ih = preparedImg.naturalHeight || preparedImg.height;

    const coverScale = Math.max(viewportSize / iw, viewportSize / ih);

    AVATAR_CROP_STATE.baseWidth = iw * coverScale;
    AVATAR_CROP_STATE.baseHeight = ih * coverScale;
    AVATAR_CROP_STATE.minScale = 1;
    AVATAR_CROP_STATE.maxScale = 3;
    AVATAR_CROP_STATE.scale = 1;

    AVATAR_CROP_STATE.x = (viewportSize - AVATAR_CROP_STATE.baseWidth) / 2;
    AVATAR_CROP_STATE.y = (viewportSize - AVATAR_CROP_STATE.baseHeight) / 2;

    clampAvatarPosition();
    zoomRange.value = "1";
    updateAvatarCropTransform();
  });
}

function applyAvatarCrop(){
  if (!STATE.me) return;

  const finalDataUrl = exportCroppedAvatarDataUrl(AVATAR_EXPORT_SIZE);
  if (!finalDataUrl) return;

  store.set(getAvatarStorageKey(), finalDataUrl);

  const { hiddenCropped } = getAvatarEls();
  if (hiddenCropped) hiddenCropped.value = finalDataUrl;

  setAvatarPreview(finalDataUrl);
  closeAvatarCropDialog();
}

async function removeAvatar(){
  if (!STATE.me || !auth.currentUser) return;

  const { hiddenCropped, input } = getAvatarEls();

  if (hiddenCropped) hiddenCropped.value = "";
  if (input) input.value = "";

  STATE.me.photoURL = "";
  setAvatarPreview("");

  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      photoURL: "",
      updatedAt: serverTimestamp()
    });
  } catch (error){
    console.error("Remove avatar error:", error);
  }
}


/* =======================================================
   Notifications
======================================================= */
function notificationsKey(){
  return STATE.me ? `ns-notifications-${STATE.me.id}` : "ns-notifications-demo";
}

function getNotifications(){
  const saved = store.get(notificationsKey(), null);
  if (Array.isArray(saved) && saved.length) return saved.map(n => ({ ...n }));
  return seedNotifications.map(n => ({ ...n }));
}

function saveNotifications(arr){
  store.set(notificationsKey(), arr);
}

function ensureNotificationsSeeded(){
  const saved = store.get(notificationsKey(), null);
  if (!Array.isArray(saved) || !saved.length){
    saveNotifications(seedNotifications.map(n => ({ ...n })));
  }
}

function unreadNotificationCount(){
  return getNotifications().filter(n => n.unread).length;
}

function renderNotifications(){
  const list = $("#notifList");
  const badge = $("#notifCount");
  if (!list || !badge) return;

  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => n.unread).length;

  badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  badge.classList.toggle("hidden", unreadCount === 0);

  if (!notifications.length){
    list.innerHTML = `
      <div class="notif-empty muted small">
        No notifications yet.
      </div>
    `;
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.unread ? "unread" : ""} ${n.type === "connection" ? "connection-notif" : ""}" data-id="${sanitize(n.id)}">
      <div class="notif-icon">${sanitize(n.icon)}</div>
      <div class="notif-copy">
        <strong>${sanitize(n.title)}</strong>
        <p>${sanitize(n.text)}</p>
        <span class="notif-time">${sanitize(n.time)}</span>
      </div>
    </div>
  `).join("");
}

function openNotifPanel(){
  const panel = $("#notifPanel");
  const btn = $("#notifBtn");
  if (!panel || !btn) return;

  renderNotifications();
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  btn.setAttribute("aria-expanded", "true");
}

function closeNotifPanel(){
  const panel = $("#notifPanel");
  const btn = $("#notifBtn");
  if (!panel || !btn) return;

  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
  btn.setAttribute("aria-expanded", "false");
}

function toggleNotifPanel(){
  const panel = $("#notifPanel");
  if (!panel) return;

  if (panel.classList.contains("hidden")){
    openNotifPanel();
  } else {
    closeNotifPanel();
  }
}

function markAllNotificationsRead(){
  const notifications = getNotifications().map(n => ({ ...n, unread:false }));
  saveNotifications(notifications);
  renderNotifications();
}

function markNotificationRead(notificationId){
  const notifications = getNotifications();
  const idx = notifications.findIndex(n => n.id === notificationId);
  if (idx < 0) return;

  notifications[idx].unread = false;
  saveNotifications(notifications);
  renderNotifications();
}

/* Messages helpers (per user) */
function messagesKey(){
  return STATE.me ? `ns-msg-${STATE.me.id}` : 'ns-msg-demo';
}
function getMessages(){
  return store.get(messagesKey(), []);
}
function saveMessages(arr){
  store.set(messagesKey(), arr);
}
function addMessage(friendId, friendName, text, dir="outgoing"){
  const msgs = getMessages();
  msgs.push({id:"msg-"+Date.now(), friendId, friendName, text, dir, ts:new Date().toISOString()});
  saveMessages(msgs);
}

/* Journal helpers (per user) */
function journalKey(){
  return STATE.me ? `ns-journal-${STATE.me.id}` : 'ns-journal-demo';
}
function getJournalEntries(){
  return store.get(journalKey(), []);
}
function saveJournalEntries(arr){
  store.set(journalKey(), arr);
}

/* =======================================================
   Study Binder (NEW) — Subjects + Notes + Word-like editor
======================================================= */

function studyKey(){
  return STATE.me ? `ns-study-${STATE.me.id}` : "ns-study-demo";
}

// data model:
// {
//   subjects: [
//     { id, name, color, createdAt, updatedAt }
//   ],
//   notes: [
//     { id, subjectId, title, html, createdAt, updatedAt }
//   ],
//   activeSubjectId: string|null,
//   activeNoteId: string|null
// }
function getStudy(){
  const fallback = { subjects:[], notes:[], activeSubjectId:null, activeNoteId:null };
  const data = store.get(studyKey(), fallback);
  // basic shape safety
  data.subjects = Array.isArray(data.subjects) ? data.subjects : [];
  data.notes = Array.isArray(data.notes) ? data.notes : [];
  return data;
}

function saveStudy(data){
  store.set(studyKey(), data);
}

function uid(prefix="id"){
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const STUDY_COLORS = ["#3FA9F5","#E5383B","#1B7F32","#a855f7","#f59e0b","#14b8a6","#f43f5e","#22c55e"];

function pickColor(seed){
  const idx = hashStringToIndex(seed, STUDY_COLORS.length);
  return STUDY_COLORS[idx];
}

function stripText(html=""){
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

/* ---- DOM getters for Study page ----
   Your HTML must include these IDs:
   #studySubjectList, #studyNoteList, #studySearch
   #studyNewSubjectBtn, #studyNewNoteBtn
   #studySubjectTitle, #studyNoteTitle
   #studyEditor (contenteditable div), #studySaveBtn
   #studyBulletBtn, #studyClearBtn
   #studyStatus
*/
function pickEl(selectors, root=document){
  for (const sel of selectors){
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function getStudyEls(){
  const root = $("#sub-study") || document;

  return {
    root,

    subjectList: pickEl(["#studySubjectList", "#subjectList", "[data-study='subjects']"], root),
    noteList:    pickEl(["#studyNoteList", "#noteList", "[data-study='notes']"], root),
    search:      pickEl(["#studySearch", "#noteSearch", "[data-study='search']"], root),

    btnNewSubject: pickEl(["#studyNewSubjectBtn", "#btnNewSubject", "[data-action='new-subject']"], root),
    btnNewNote:    pickEl(["#studyNewNoteBtn", "#btnNewNote", "[data-action='new-note']"], root),

    subjectTitle: pickEl(["#studySubjectTitle", "#subjectTitle"], root),
    noteTitle:    pickEl(["#studyNoteTitle", "#noteTitle"], root),

    editor:    pickEl(["#studyEditor", "#noteEditor", "[contenteditable='true']"], root),
    btnSave:   pickEl(["#studySaveBtn", "#btnSaveNote", "[data-action='save-note']"], root),
    btnBullet: pickEl(["#studyBulletBtn", "#btnBullet", "[data-action='toggle-bullets']"], root),
    btnClear:  pickEl(["#studyClearBtn", "#btnClear", "[data-action='clear-note']"], root),

    btnBold:      pickEl(["#btnBold"], root),
    btnItalic:    pickEl(["#btnItalic"], root),
    btnUnderline: pickEl(["#btnUnderline"], root),
    btnHighlight: pickEl(["#btnHighlight"], root),

    activeSubjectPill: pickEl(["#activeSubjectPill"], root),
    studySubjectSelect: pickEl(["#studySubjectSelect"], root),

    btnToggleStudySidebar: pickEl(["#btnToggleStudySidebar"], root),
    studySidebar: pickEl(["#studySidebar"], root),

    btnCloseNote: pickEl(["#btnCloseNote"], root),
    btnDeleteNote: pickEl(["#btnDeleteNote"], root),

    status: pickEl(["#studyStatus", "#saveStatus", "[data-study='status']"], root)
  };
}

function isStudyMobile(){
  return window.innerWidth <= 980;
}

function openStudySidebar(){
  const { studySidebar, btnToggleStudySidebar } = getStudyEls();
  if (!studySidebar) return;

  studySidebar.classList.add("open");

  if (btnToggleStudySidebar){
    btnToggleStudySidebar.setAttribute("aria-expanded", "true");
    btnToggleStudySidebar.textContent = "✕ Close Subjects & Notes";
  }
}

function closeStudySidebar(){
  const { studySidebar, btnToggleStudySidebar } = getStudyEls();
  if (!studySidebar) return;

  if (isStudyMobile()){
    studySidebar.classList.remove("open");
    if (btnToggleStudySidebar){
      btnToggleStudySidebar.setAttribute("aria-expanded", "false");
      btnToggleStudySidebar.textContent = "☰ Subjects & Notes";
    }
  }
}

function toggleStudySidebar(){
  const { studySidebar } = getStudyEls();
  if (!studySidebar) return;

  if (studySidebar.classList.contains("open")){
    closeStudySidebar();
  } else {
    openStudySidebar();
  }
}


function renderStudySubjectSelect(subjects, activeSubjectId){
  const { studySubjectSelect } = getStudyEls();
  if (!studySubjectSelect) return;

  studySubjectSelect.innerHTML = subjects.map(s => `
    <option value="${sanitize(s.id)}" ${s.id === activeSubjectId ? "selected" : ""}>
      ${sanitize(s.name)}
    </option>
  `).join("");
}

function setStudyStatus(msg){
  const { status } = getStudyEls();
  if (!status) return;
  status.textContent = msg || "";
}

function setActiveSubjectPill(subject){
  const { activeSubjectPill } = getStudyEls();
  if (!activeSubjectPill) return;

  if (!subject){
    activeSubjectPill.classList.remove("on");
    activeSubjectPill.innerHTML = "";
    return;
  }

  activeSubjectPill.classList.add("on");
  activeSubjectPill.innerHTML = `
    <span class="dot" style="background:${sanitize(subject.color || "#3FA9F5")}"></span>
    <span>${sanitize(subject.name || "")}</span>
  `;
}

function editorCmd(cmd, value=null){
  const { editor } = getStudyEls();
  if (!editor) return;

  editor.focus({ preventScroll:true });

  // Works well for this SPA demo (mobile + desktop)
  try {
    document.execCommand(cmd, false, value);
  } catch(e){
    console.warn("execCommand failed:", cmd, e);
  }
}

/* ---- Bullet / list helpers ---- */
function ensureEditorFocus(editor){
  if (!editor) return;
  editor.focus({ preventScroll:true });
}

function toggleBulletsInEditor(editor){
  if (!editor) return;
  ensureEditorFocus(editor);

  // Try execCommand first (works in most browsers)
  try {
    document.execCommand("insertUnorderedList");
    return;
  } catch {}

  // Fallback: wrap selection in <ul><li>
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const content = range.extractContents();
  const text = (content.textContent || "").trim() || "• ";
  const ul = document.createElement("ul");
  const li = document.createElement("li");
  li.textContent = text;
  ul.appendChild(li);
  range.insertNode(ul);
  sel.removeAllRanges();
}

/* ---- Create / Update ---- */
function createSubject(name){
  const data = getStudy();
  const now = new Date().toISOString();
  const subject = {
    id: uid("subj"),
    name: name.trim(),
    color: pickColor(name.trim()),
    createdAt: now,
    updatedAt: now
  };
  data.subjects.unshift(subject);
  data.activeSubjectId = subject.id;
  data.activeNoteId = null;
  saveStudy(data);
  return subject;
}

function createNote(subjectId, title="New Note"){
  const data = getStudy();
  const now = new Date().toISOString();
  const note = {
    id: uid("note"),
    subjectId,
    title: title.trim() || "New Note",
    html: "",
    createdAt: now,
    updatedAt: now
  };
  data.notes.unshift(note);
  data.activeNoteId = note.id;
  saveStudy(data);
  return note;
}

function deleteSubject(subjectId){
  const data = getStudy();
  const subj = data.subjects.find(s => s.id === subjectId);
  if (!subj) return;

  const ok = confirm(`Delete subject "${subj.name}"?\n\nAll notes in this subject will also be deleted.`);
  if (!ok) return;

  // delete notes in subject
  data.notes = data.notes.filter(n => n.subjectId !== subjectId);

  // delete subject
  data.subjects = data.subjects.filter(s => s.id !== subjectId);

  // fix active ids
  if (data.activeSubjectId === subjectId){
    data.activeSubjectId = data.subjects[0]?.id || null;
  }
  const activeNote = data.notes.find(n => n.id === data.activeNoteId);
  if (!activeNote) data.activeNoteId = null;

  saveStudy(data);
}

function updateNote(noteId, patch){
  const data = getStudy();
  const i = data.notes.findIndex(n => n.id === noteId);
  if (i < 0) return;
  data.notes[i] = { ...data.notes[i], ...patch, updatedAt: new Date().toISOString() };
  saveStudy(data);
}

function saveActiveStudyNoteNow(){
  const data = getStudy();
  const els = getStudyEls();
  const id = data.activeNoteId;

  if (!id || !els.editor) return false;

  const title = (els.noteTitle?.value || "").trim() || "Untitled";
  const html = els.editor.innerHTML || "";

  let subjectId = data.activeSubjectId || null;
  if (els.studySubjectSelect && els.studySubjectSelect.value){
    subjectId = els.studySubjectSelect.value;
  }

  updateNote(id, {
    title,
    html,
    subjectId
  });

  return true;
}

function setActiveSubject(subjectId){
  const data = getStudy();
  data.activeSubjectId = subjectId;
  // if active note isn't in this subject, clear it
  const active = data.notes.find(n => n.id === data.activeNoteId);
  if (!active || active.subjectId !== subjectId){
    data.activeNoteId = null;
  }
  saveStudy(data);
}

function setActiveNote(noteId){
  const data = getStudy();
  data.activeNoteId = noteId;
  const note = data.notes.find(n => n.id === noteId);
  if (note) data.activeSubjectId = note.subjectId;
  saveStudy(data);
}

function clearActiveNote(){
  const data = getStudy();
  data.activeNoteId = null;
  saveStudy(data);
}

/* ---- Rendering ---- */
function renderStudy(){
  const els = getStudyEls();
  if (!els.subjectList || !els.noteList || !els.editor) return;

  const data = getStudy();
  const term = (els.search?.value || "").toLowerCase();

  // ensure at least one subject for first-time users (optional)
  if (!data.subjects.length){
    const starter = createSubject("General");
    createNote(starter.id, "Welcome Notes");
    const fresh = getStudy();
    fresh.notes[0].html = "<p>Start taking notes here. Tap <b>• Bullets</b> for bullet points.</p>";
    saveStudy(fresh);
  }

  const d = getStudy();
  const activeSubject = d.subjects.find(s => s.id === d.activeSubjectId) || d.subjects[0] || null;
  if (activeSubject && d.activeSubjectId !== activeSubject.id){
    setActiveSubject(activeSubject.id);
  }
  
  setActiveSubjectPill(activeSubject);
  
    renderStudySubjectSelect(d.subjects, activeSubject?.id || "");

  const dd = getStudy();
  const subjects = dd.subjects.filter(s => {
    if (!term) return true;
    return s.name.toLowerCase().includes(term);
  });

  const notesForSubject = dd.notes.filter(n => n.subjectId === (activeSubject?.id || ""));
  const notes = notesForSubject.filter(n => {
    if (!term) return true;
    const body = stripText(n.html).toLowerCase();
    return n.title.toLowerCase().includes(term) || body.includes(term);
  });

  // SUBJECT LIST
  // SUBJECT LIST
els.subjectList.innerHTML = subjects.map(s => {
  const count = dd.notes.filter(n => n.subjectId === s.id).length;
  const isActive = activeSubject && activeSubject.id === s.id;

  return `
    <li class="item ${isActive ? "active" : ""}" data-subject-id="${s.id}">
      <div class="study-item-left">
        <span class="study-dot" style="background:${sanitize(s.color)}"></span>

        <div style="min-width:0">
          <!-- ✅ Full name + tooltip (CSS should allow wrapping; JS ensures full value exists) -->
          <div class="study-item-title" title="${sanitize(s.name)}">${sanitize(s.name)}</div>
          <div class="study-item-sub">${count} note${count===1?"":"s"}</div>
        </div>
      </div>

      <!-- ✅ DELETE SUBJECT -->
      <button class="btn small chip danger" data-action="delete-subject" type="button" title="Delete subject">
        Delete
      </button>
    </li>
  `;
}).join("") || `<li class="item small muted">No subjects yet.</li>`;

  // NOTES LIST
  // NOTES LIST
els.noteList.innerHTML = notes.map(n => {
  const isActive = dd.activeNoteId === n.id;
  const preview = stripText(n.html).slice(0,60);

  return `
    <li class="item ${isActive ? "active" : ""}" data-note-id="${n.id}">
      <div class="study-item-left">
        <div style="min-width:0">
          <div class="study-item-title">${sanitize(n.title)}</div>
          <div class="study-item-sub">${sanitize(preview || "No content yet…")}</div>
        </div>
      </div>

      <div class="row" style="gap:8px;justify-content:flex-end">
        <button class="btn small btn-view" data-action="open-note" type="button">
          ${isActive ? "Close" : "Open"}
        </button>
        <button class="btn small chip danger" data-action="delete-note" type="button">Delete</button>
      </div>
    </li>
  `;
}).join("") || `<li class="item small muted">No notes yet. Tap “New Note”.</li>`;

  // EDITOR PANEL
    // EDITOR PANEL (SAFE)
  const selectedNote = dd.notes.find(n => n.id === dd.activeNoteId) || null;
  
    const { btnCloseNote, btnDeleteNote } = els;

  if (btnCloseNote){
    btnCloseNote.disabled = !selectedNote;
  }

  if (btnDeleteNote){
    btnDeleteNote.disabled = !selectedNote;
  }

  // Subject title (guarded)
  if (els.subjectTitle){
    els.subjectTitle.textContent = activeSubject ? activeSubject.name : "Study";
  }

  // Note title (guarded)
  if (els.noteTitle){
    els.noteTitle.value = selectedNote ? (selectedNote.title || "") : "";
  }

  // Editor content (editor is required by the early return, but keep it safe)
  els.editor.innerHTML = selectedNote ? (selectedNote.html || "") : "";

  // One single status message (no duplicate overwrites)
  if (!selectedNote){
    setStudyStatus("Select a note to view it, or create a new one.");
  } else {
    setStudyStatus(`Viewing • Last saved: ${new Date(selectedNote.updatedAt).toLocaleString()}`);
  }

  if (!selectedNote){
    els.editor.setAttribute("data-placeholder", "Start typing your notes...");
  }

  bindStudyOnce();
}

let STUDY_BOUND = false;

function bindStudyOnce(){
  const els = getStudyEls();
  const root = els.root;
  if (!root) return;

  // ✅ Bind per-root so if the Study DOM is re-rendered, it re-binds correctly
  if (root.dataset.studyBound === "1") return;

  // If key pieces aren’t present yet, don’t bind yet
  if (!els.subjectList || !els.noteList || !els.editor) return;

  // Mark bound ONLY after we confirm elements exist
  root.dataset.studyBound = "1";
  
  
    // Mobile Study sidebar toggle
  if (els.btnToggleStudySidebar && !els.btnToggleStudySidebar.dataset.bound){
    els.btnToggleStudySidebar.dataset.bound = "1";
    els.btnToggleStudySidebar.addEventListener("click", () => {
      toggleStudySidebar();
    });
  }

  // Subject select dropdown
  if (els.studySubjectSelect && !els.studySubjectSelect.dataset.bound){
    els.studySubjectSelect.dataset.bound = "1";
    els.studySubjectSelect.addEventListener("change", () => {
      const subjectId = els.studySubjectSelect.value;
      if (!subjectId) return;

      const data = getStudy();
      const activeNoteId = data.activeNoteId;

      if (activeNoteId){
        saveActiveStudyNoteNow();
        updateNote(activeNoteId, { subjectId });
        data.activeSubjectId = subjectId;
        saveStudy(data);
      } else {
        setActiveSubject(subjectId);
      }

      renderStudy();
      setStudyStatus("Subject updated ✅");
      closeStudySidebar();
    });
  }

  // Close current note
  if (els.btnCloseNote && !els.btnCloseNote.dataset.bound){
    els.btnCloseNote.dataset.bound = "1";
    els.btnCloseNote.addEventListener("click", () => {
      saveActiveStudyNoteNow();
      clearActiveNote();
      renderStudy();
      setStudyStatus("Closed note ✅");
    });
  }

  // Delete current note from editor actions
  if (els.btnDeleteNote && !els.btnDeleteNote.dataset.bound){
    els.btnDeleteNote.dataset.bound = "1";
    els.btnDeleteNote.addEventListener("click", () => {
      const data = getStudy();
      const id = data.activeNoteId;
      if (!id){
        alert("Select a note first.");
        return;
      }

      const ok = confirm("Delete this note? This cannot be undone.");
      if (!ok) return;

      data.notes = data.notes.filter(n => n.id !== id);
      data.activeNoteId = null;
      saveStudy(data);

      renderStudy();
      setStudyStatus("Note deleted ✅");
    });
  }

  // Search (live filter)
  if (els.search && !els.search.dataset.bound){
    els.search.dataset.bound = "1";
    els.search.addEventListener("input", () => renderStudy());
  }

  // New Subject
  if (els.btnNewSubject && !els.btnNewSubject.dataset.bound){
    els.btnNewSubject.dataset.bound = "1";
    els.btnNewSubject.addEventListener("click", () => {
      const name = prompt("New subject name (ex: Biology, Math, History):");
      if (!name || !name.trim()) return;
      createSubject(name);
      renderStudy();
      setStudyStatus("Subject created ✅");

      if (isStudyMobile()){
        openStudySidebar();
      }
    });
  }

  // New Note
    if (els.btnNewNote && !els.btnNewNote.dataset.bound){
    els.btnNewNote.dataset.bound = "1";
    els.btnNewNote.addEventListener("click", () => {
      saveActiveStudyNoteNow();

      const data = getStudy();
      const subjId = data.activeSubjectId || data.subjects[0]?.id;
      if (!subjId){
        alert("Create a subject first.");
        return;
      }

      const title = prompt("Note title (ex: Chapter 3, Exam Review):") || "New Note";
      createNote(subjId, title);
      renderStudy();
      setStudyStatus("New note created ✅");
      closeStudySidebar();

      const { editor } = getStudyEls();
      if (editor){
        setTimeout(() => editor.focus(), 120);
      }
    });
  }

  // Delegated clicks inside SUBJECT LIST (select + rename)
  // Delegated clicks inside SUBJECT LIST (select + delete)
  els.subjectList.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-subject-id]");
    if (!li) return;

    const subjectId = li.dataset.subjectId;

    const delBtn = e.target.closest("button[data-action='delete-subject']");
    if (delBtn){
      e.preventDefault();
      e.stopPropagation();
      deleteSubject(subjectId);
      renderStudy();
      setStudyStatus("Subject deleted ✅");
      return;
    }

    saveActiveStudyNoteNow();
    setActiveSubject(subjectId);
    renderStudy();
    setStudyStatus("Subject selected ✅");
    closeStudySidebar();
  });

  // ✅ Delegated clicks inside NOTE LIST (select + delete)
  // ✅ Delegated clicks inside NOTE LIST (open/close + delete + row tap)
  els.noteList.addEventListener("click", (e) => {
    const li = e.target.closest("[data-note-id]");
    if (!li) return;

    const noteId = li.dataset.noteId;

    const delBtn = e.target.closest("button[data-action='delete-note']");
    if (delBtn){
      e.preventDefault();
      e.stopPropagation();

      const ok = confirm("Delete this note? This cannot be undone.");
      if (!ok) return;

      const data = getStudy();
      data.notes = data.notes.filter(n => n.id !== noteId);
      if (data.activeNoteId === noteId) data.activeNoteId = null;
      saveStudy(data);

      renderStudy();
      setStudyStatus("Note deleted ✅");
      return;
    }

    const openBtn = e.target.closest("button[data-action='open-note']");
    if (openBtn){
      e.preventDefault();
      e.stopPropagation();

const data = getStudy();

if (data.activeNoteId === noteId){
  saveActiveStudyNoteNow();
  clearActiveNote();
  renderStudy();
  setStudyStatus("Closed note ✅");
} else {
  saveActiveStudyNoteNow();
  setActiveNote(noteId);
  renderStudy();
  setStudyStatus("Opened note ✅");
  closeStudySidebar();
}
return;
    }

    setActiveNote(noteId);
    renderStudy();
    setStudyStatus("Opened note ✅");
    closeStudySidebar();
  });

  // Save button
  if (els.btnSave && !els.btnSave.dataset.bound){
    els.btnSave.dataset.bound = "1";
    els.btnSave.addEventListener("click", () => {
      const data = getStudy();
      const id = data.activeNoteId;
      if (!id){
        alert("Create/select a note first.");
        return;
      }

      saveActiveStudyNoteNow();
      setStudyStatus("Saved ✅");
      renderStudy();
    });
  }

  // Bullet button
  if (els.btnBullet && !els.btnBullet.dataset.bound){
    els.btnBullet.dataset.bound = "1";
    els.btnBullet.addEventListener("click", () => {
      toggleBulletsInEditor(els.editor);

      const data = getStudy();
      const id = data.activeNoteId;
      if (id) updateNote(id, { html: els.editor.innerHTML });

      setStudyStatus("Bullets updated ✅");
      // do NOT renderStudy() here to avoid cursor jump
    });
  }
  
  // ✅ Formatting buttons: Bold / Italic / Underline / Highlight
if (els.btnBold && !els.btnBold.dataset.bound){
  els.btnBold.dataset.bound = "1";
  els.btnBold.addEventListener("click", () => editorCmd("bold"));
}
if (els.btnItalic && !els.btnItalic.dataset.bound){
  els.btnItalic.dataset.bound = "1";
  els.btnItalic.addEventListener("click", () => editorCmd("italic"));
}
if (els.btnUnderline && !els.btnUnderline.dataset.bound){
  els.btnUnderline.dataset.bound = "1";
  els.btnUnderline.addEventListener("click", () => editorCmd("underline"));
}
if (els.btnHighlight && !els.btnHighlight.dataset.bound){
  els.btnHighlight.dataset.bound = "1";
  els.btnHighlight.addEventListener("click", () => {
    // Try highlight first, then fallback
    editorCmd("hiliteColor", "yellow");
    editorCmd("backColor", "yellow");
  });
}

  // Clear button (optional)
  if (els.btnClear && !els.btnClear.dataset.bound){
    els.btnClear.dataset.bound = "1";
    els.btnClear.addEventListener("click", () => {
      const ok = confirm("Clear the editor content for this note?");
      if (!ok) return;

      const data = getStudy();
      const id = data.activeNoteId;
      if (!id) return;

      els.editor.innerHTML = "";
      updateNote(id, { html: "" });
      setStudyStatus("Cleared ✅");
      renderStudy();
    });
  }

  // Title input → updates note title (no rerender)
  if (els.noteTitle && !els.noteTitle.dataset.bound){
    els.noteTitle.dataset.bound = "1";
    els.noteTitle.addEventListener("input", () => {
      const data = getStudy();
      const id = data.activeNoteId;
      if (!id) return;

      saveActiveStudyNoteNow();
      setStudyStatus("Title updated ✅");
    });
  }

  // Auto-save while typing (fast + reliable)
  if (els.editor && !els.editor.dataset.bound){
    els.editor.dataset.bound = "1";
    let t = null;

    els.editor.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const data = getStudy();
        const id = data.activeNoteId;
        if (!id) return;

        saveActiveStudyNoteNow();
        setStudyStatus("Auto-saved ✅");
      }, 700);
    });

    els.editor.addEventListener("blur", () => {
      const data = getStudy();
      const id = data.activeNoteId;
      if (!id) return;

      saveActiveStudyNoteNow();
      setStudyStatus("Saved ✅");
    });
  }
}

/* =======================================================
   STUDIO — CHATGPT-STYLE INNOVATOR ASSISTANT
======================================================= */

function studioChatsKey(){
  return STATE.me ? `ns-studio-chats-${STATE.me.id}` : "ns-studio-chats-demo";
}

function getStudioData(){
  const fallback = {
    chats: [],
    activeChatId: null
  };

  const data = store.get(studioChatsKey(), fallback) || fallback;
  data.chats = Array.isArray(data.chats) ? data.chats : [];
  data.activeChatId = data.activeChatId || null;

  // First-time setup: start with a truly clean new chat
  if (!data.chats.length){
    const seed = createStudioChatObject("New Innovator Chat");
    data.chats = [seed];
    data.activeChatId = seed.id;
    saveStudioData(data);
  }

  return data;
}

function saveStudioData(data){
  store.set(studioChatsKey(), data);
}


function createStudioChatObject(title="Innovator Chat"){
  const now = new Date().toISOString();

  return {
    id: uid("studio-chat"),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    innovatorId: null,
    innovatorName: null,
    innovatorAchievement: null,
    innovatorSource: null
  };
}


function getActiveStudioChat(data = getStudioData()){
  return data.chats.find(c => c.id === data.activeChatId) || data.chats[0] || null;
}

function setActiveStudioChat(chatId){
  const data = getStudioData();
  const exists = data.chats.some(c => c.id === chatId);
  if (!exists) return;
  data.activeChatId = chatId;
  saveStudioData(data);
}

function createNewStudioChat(title="New Innovator Chat"){
  const data = getStudioData();
  const chat = createStudioChatObject(title);
  data.chats.unshift(chat);
  data.activeChatId = chat.id;
  saveStudioData(data);
  return chat;
}

function renameStudioChat(chatId, newTitle){
  const data = getStudioData();
  const chat = data.chats.find(c => c.id === chatId);
  if (!chat) return;
  chat.title = (newTitle || "").trim() || "Untitled Chat";
  chat.updatedAt = new Date().toISOString();
  saveStudioData(data);
}

function deleteStudioChat(chatId){
  const data = getStudioData();
  const idx = data.chats.findIndex(c => c.id === chatId);
  if (idx < 0) return;

  data.chats.splice(idx, 1);

  if (!data.chats.length){
    const chat = createStudioChatObject("New Innovator Chat");
    data.chats = [chat];
    data.activeChatId = chat.id;
  } else if (data.activeChatId === chatId){
    data.activeChatId = data.chats[0].id;
  }

  saveStudioData(data);
}

function addStudioMessage(chatId, role, text){
  const data = getStudioData();
  const chat = data.chats.find(c => c.id === chatId);
  if (!chat) return;

  chat.messages.push({
    id: uid("studio-msg"),
    role,
    text: String(text || "").trim()
  });

  chat.updatedAt = new Date().toISOString();

  // Auto-title from first user message
  if (role === "user"){
    const userMsgs = chat.messages.filter(m => m.role === "user");
    if (userMsgs.length === 1 && (!chat.title || chat.title === "Innovator Chat")){
      chat.title = makeStudioTitleFromPrompt(text);
    }
  }

  saveStudioData(data);
}

function makeStudioTitleFromPrompt(prompt=""){
  const clean = String(prompt).replace(/\s+/g, " ").trim();
  if (!clean) return "Innovator Chat";
  return clean.length > 38 ? clean.slice(0, 38) + "…" : clean;
}


function studioMessageHTML(text="", role="assistant"){
  const content = String(text || "");

  // Keep user messages as safe, plain text.
  if (role === "user"){
    return sanitize(content).replace(/\n/g, "<br>");
  }

  // Format AI responses using Markdown.
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined"){
    const html = marked.parse(content, {
      gfm: true,
      breaks: true
    });

    return DOMPurify.sanitize(html);
  }

  // Safe fallback if Markdown libraries are unavailable.
  return sanitize(content).replace(/\n/g, "<br>");
}


function renderStudio(){
  const data = getStudioData();
  let activeChat = getActiveStudioChat(data);

  if (!activeChat){
    activeChat = createNewStudioChat("New Innovator Chat");
  }

  const chatList = $("#studioChatList");
  const messagesWrap = $("#studioMessages");
  const titleEl = $("#studioActiveChatTitle");
  const welcomeBox = $("#studioWelcomeBox");
  const searchEl = $("#studioChatSearch");

  if (!chatList || !messagesWrap || !titleEl || !welcomeBox) return;

  const term = (searchEl?.value || "").trim().toLowerCase();

  const visibleChats = [...data.chats]
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .filter(chat => {
      if (!term) return true;
      const body = (chat.messages || []).map(m => m.text).join(" ").toLowerCase();
      return (chat.title || "").toLowerCase().includes(term) || body.includes(term);
    });

  chatList.innerHTML = visibleChats.map(chat => {
    const previewMsg = (chat.messages || []).slice(-1)[0]?.text || "No messages yet";
    return `
      <button class="studio-chat-thread ${chat.id === activeChat.id ? "active" : ""}" type="button" data-chat-id="${sanitize(chat.id)}">
        <div class="studio-chat-thread-title">${sanitize(chat.title || "Untitled Chat")}</div>
        <div class="studio-chat-thread-preview">${sanitize(previewMsg)}</div>
      </button>
    `;
  }).join("") || `<div class="small muted">No chats found.</div>`;

  titleEl.textContent = activeChat.title || "New Innovator Chat";

  
  // Display the African American innovator
  // assigned to the current conversation.

  let guideLabel = document.getElementById(
    "studioInnovatorLabel"
  );

  if (!guideLabel) {
    guideLabel = document.createElement("div");
    guideLabel.id = "studioInnovatorLabel";
    guideLabel.className = "studio-innovator-label";

    titleEl.insertAdjacentElement(
      "afterend",
      guideLabel
    );
  }

  if (activeChat.innovatorName) {
    guideLabel.textContent =
      `Guided by ${activeChat.innovatorName} · AI interpretation`;
  } else {
    guideLabel.textContent =
      "Your African American innovation mentor awaits";
  }


  const msgs = activeChat.messages || [];
  welcomeBox.style.display = msgs.length ? "none" : "grid";

  messagesWrap.innerHTML = msgs.map(m => {
    const isUser = m.role === "user";
    return `
      <div class="studio-msg ${isUser ? "user" : "assistant"}">
        
<div
  class="studio-msg-avatar"
  title="${
    isUser
      ? 'You'
      : sanitize(activeChat.innovatorName || 'NSAAI Studio AI')
  }"
>
  ${isUser ? "🧑🏾" : "💡"}
</div>

        <div class="studio-msg-bubble">${studioMessageHTML(m.text, m.role)}</div>
      </div>
    `;
  }).join("");

  requestAnimationFrame(() => {
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  });

  autoResizeStudioInput();
}

function autoResizeStudioInput(){
  const input = $("#studioInput");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

function getStudioPromptSuggestions(){
  return [
    "Help me come up with an innovative app idea for students",
    "Give me 5 invention ideas that solve a real everyday problem",
    "Help me turn my rough idea into a business concept",
    "Improve my 60-second pitch",
    "Give me a step-by-step plan to prototype this idea",
    "Help me brand this idea and come up with a cool name",
    "How can I test whether people actually want this product?",
    "Write a simple outreach message to potential collaborators"
  ];
}

function getRandomStudioPrompt(){
  return rp(getStudioPromptSuggestions());
}

function studioFollowUpBlock(questionA, questionB){
  return `

A couple good next questions for you:
• ${questionA}
• ${questionB}`;
}

function generateIdeaReply(prompt){
  return `Love this direction.

Here’s how I would shape the idea:

1. Core problem
Figure out the exact frustration, inefficiency, or unmet need.

2. Target user
Be specific about who this is for first.

3. Simple solution
Do not build too much at once. Focus on one strong first version.

4. What makes it different
Your advantage could be speed, simplicity, culture fit, community, price, trust, or experience.

5. MVP
Start with the smallest version that proves people care.

6. First validation step
Talk to 5–10 real people and show them the concept.

Best next move:
Ask me to turn this into:
• an MVP feature list
• a business model
• a pitch
• a launch plan` + studioFollowUpBlock(
    "Who exactly is this for first?",
    "What is the one biggest problem this idea solves?"
  );
}

function generatePitchReply(prompt){
  return `Here’s a stronger way to shape your pitch:

1. Problem
What real pain point are you solving?

2. Solution
What exactly are you building, in simple language?

3. Who it’s for
Who needs this most right now?

4. Why now
Why is this the right time for this idea?

5. Proof
What traction, test, insight, or lived experience supports it?

6. Ask
What support, connection, funding, or next step do you want?

Strong tip:
Make your pitch sound human, clear, and specific — not overly corporate.

Next move:
Paste your pitch here and I’ll improve it line by line.` + studioFollowUpBlock(
    "What is your idea in one sentence?",
    "What specific ask do you want to make at the end of the pitch?"
  );
}

function generateBrandReply(prompt){
  return `For branding, I would focus on 4 things:

1. Clarity
People should quickly understand the feeling or purpose.

2. Memorability
The name should be easy to remember and say.

3. Energy
Decide whether the vibe is bold, premium, playful, futuristic, or purpose-driven.

4. Fit
It should match the audience, mission, and type of product.

A strong brand package usually includes:
• name ideas
• slogan ideas
• color / vibe direction
• one-line positioning
• short bio / description` + studioFollowUpBlock(
    "Do you want the brand to feel more bold, premium, playful, or purpose-driven?",
    "Who is the exact audience you want the brand to connect with?"
  );
}

function generatePrototypeReply(prompt){
  return `Here’s a smart prototype path:

1. Define the proof
What is the one thing the prototype needs to prove?

2. Strip features down
Keep only the essentials.

3. Choose the format
It could be:
• sketch
• mockup
• clickable prototype
• no-code test
• manual service version

4. Test it fast
Put it in front of a few real people.

5. Watch for friction
Notice what confuses people or slows them down.

6. Improve before expanding
Do not add more until the main concept works.

Mindset:
Prototype for learning, not perfection.` + studioFollowUpBlock(
    "What is the simplest version you could show someone this week?",
    "What user action would prove the concept is working?"
  );
}

function generateFundingReply(prompt){
  return `When thinking about funding, start with fit.

Different paths:
• grants for impact-driven or education-based ideas
• pitch competitions for exposure and early money
• sponsorships for community-facing projects
• investors for scalable businesses
• customers if you can sell early

Before asking for money, be ready with:
• the problem
• the solution
• who it helps
• why it matters
• what the money will be used for
• what success looks like after funding` + studioFollowUpBlock(
    "How much support do you actually need first?",
    "What would you use the first money for specifically?"
  );
}

function generateCollabReply(prompt){
  return `Good collaborations happen when there is clarity on both sides.

Think about:
• what you bring
• what you need
• why this person is a good fit
• what the timeline is
• what value they get too

A strong collaboration message should include:
• who you are
• what you are building
• why you thought of them
• the exact ask
• the easiest next step` + studioFollowUpBlock(
    "What do you need from the collaborator most right now?",
    "Why is this specific person a strong fit?"
  );
}

function generateGeneralReply(prompt){
  return `Here’s a strong way to move this forward:

1. Clarify the real problem
2. Define who this is for
3. Simplify the solution
4. Make it different
5. Test it quickly
6. Turn it into a real next step

A strong builder mindset is:
clarity first, momentum second, polish later.

I can help you turn this into:
• an idea
• an MVP
• a business model
• a pitch
• outreach copy
• a launch plan` + studioFollowUpBlock(
    "What are you trying to build or solve specifically?",
    "What would progress look like for you in the next 7 days?"
  );
}

function generateStudioAssistantReply(prompt){
  const p = String(prompt || "").trim();
  const lower = p.toLowerCase();

  if (!p){
    return "Tell me what you're building, and I’ll help you shape it.";
  }

  if (
    lower.includes("idea") ||
    lower.includes("invent") ||
    lower.includes("innovation") ||
    lower.includes("app")
  ){
    return generateIdeaReply(p);
  }

  if (lower.includes("pitch")){
    return generatePitchReply(p);
  }

  if (
    lower.includes("brand") ||
    lower.includes("name") ||
    lower.includes("slogan")
  ){
    return generateBrandReply(p);
  }

  if (
    lower.includes("prototype") ||
    lower.includes("mvp") ||
    lower.includes("build")
  ){
    return generatePrototypeReply(p);
  }

  if (
    lower.includes("fund") ||
    lower.includes("grant") ||
    lower.includes("invest") ||
    lower.includes("money")
  ){
    return generateFundingReply(p);
  }

  if (
    lower.includes("collab") ||
    lower.includes("partner") ||
    lower.includes("outreach") ||
    lower.includes("message")
  ){
    return generateCollabReply(p);
  }

  return generateGeneralReply(p);
}

/* NSAAI Studio source-grounded assistant: metadata only, no unauthorized full-text ingestion. */
let NSAAI_STUDIO_SOURCES = [];
let NSAAI_STUDIO_LOADING = null;
function loadNSAAIStudioSources(){
  if (NSAAI_STUDIO_LOADING) return NSAAI_STUDIO_LOADING;
  NSAAI_STUDIO_LOADING = fetch('./studio-sources.json', {cache:'no-cache'})
    .then(r => { if (!r.ok) throw new Error('Knowledge base unavailable'); return r.json(); })
    .then(data => { NSAAI_STUDIO_SOURCES = Array.isArray(data) ? data : []; return NSAAI_STUDIO_SOURCES; })
    .catch(err => { console.warn('Studio sources:', err); return []; });
  return NSAAI_STUDIO_LOADING;
}
function studioTerms(s){
 return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)?.filter(w=>!new Set(['the','and','for','with','from','that','this','what','how','can','you','your','about','are','was','who','give','tell','black','innovator','innovation','innovators','help','please','some','their','work','want','idea','ideas','make','could','would']).has(w))||[];
}
function rankStudioSources(prompt){
 const terms=[...new Set(studioTerms(prompt))];
 if(!terms.length) return [];
 return NSAAI_STUDIO_SOURCES.map(s=>{
   const title=String(s.title||'').toLowerCase(), people=String(s.creators||'').toLowerCase(), type=String(s.type||'').toLowerCase();
   const score=terms.reduce((n,t)=>n+(title.includes(t)?5:0)+(people.includes(t)?7:0)+(type.includes(t)?1:0),0);
   return {s,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.s.id-b.s.id).slice(0,4).map(x=>x.s);
}
function sourceLine(s){
 const link=/^https:\/\/[^\s]+$/i.test(s.url)?s.url:'';
 return `• ${s.title} — ${s.creators||'Creator not specified'}${link?'\n  Source: '+link:''}`;
}
function generateNSAAISourceReply(prompt, chat){
 const p=String(prompt||'').trim(), lower=p.toLowerCase();
 const matches=rankStudioSources(p);
 const recent=(chat?.messages||[]).slice(-7,-1).filter(m=>m.role==='user').map(m=>m.text).join(' ');
 const contextual=matches.length?matches:rankStudioSources(recent+' '+p);
 const isSourceQuestion=/who|invent|patent|source|research|created|history|example|discover|contribut|technology|develop|reference|citation|credit|black innovator/i.test(lower);
 const isBuilding=/app|business|startup|pitch|fund|prototype|mvp|product|build|design|market|project|launch|brand|idea|invent/i.test(lower);
 let opening='';
 if (/^(hi|hello|hey|good morning|good afternoon)[!. ]*$/i.test(p)) opening='Welcome to NSAAI Studio! I can help you explore Black innovators’ work, develop an idea, and plan your next steps.';
 else if(isBuilding) opening=generateStudioAssistantReply(p);
 else if(isSourceQuestion) opening='Great question. NSAAI Studio draws on a curated testing collection highlighting Black innovators and their documented contributions. Here are relevant records from that collection.';
 else opening='I can help you explore this through the lens of Black innovation, with attention to accurate attribution, practical solutions, and the communities your work could serve.\n\n'+generateStudioAssistantReply(p);
 if(contextual.length){
   opening+='\n\nRelevant work by Black innovators (curated source records):\n'+contextual.map(sourceLine).join('\n\n');
   opening+='\n\nThese are source titles and metadata, not verified summaries of the full documents. Open the originals to confirm technical details, inventorship and applicability.';
 }else if(isSourceQuestion){
   opening+='\n\nI did not find a strong match for that specific subject in the 100-source testing collection. Try an inventor’s name, an invention, or a technical field. I won’t invent a citation.';
 }else{
   opening+='\n\nIf you share the field or problem you are tackling, I can look for relevant work in the curated Black innovator source collection.';
 }
 return opening;
}
loadNSAAIStudioSources();

function showStudioTyping(){
  const messagesWrap = $("#studioMessages");
  if (!messagesWrap) return;

  const existing = $("#studioTyping");
  if (existing) existing.remove();

  const typing = document.createElement("div");
  typing.className = "studio-msg assistant";
  typing.id = "studioTyping";
  typing.innerHTML = `
    <div class="studio-msg-avatar">⚡</div>
    <div class="studio-msg-bubble">Thinking…</div>
  `;
  messagesWrap.appendChild(typing);
  messagesWrap.scrollTop = messagesWrap.scrollHeight;
}

function hideStudioTyping(){
  const typing = $("#studioTyping");
  if (typing) typing.remove();
}

let studioRequestBusy = false;

async function submitStudioPrompt(promptText){
  const text = String(promptText || "").trim();

  if (!text || studioRequestBusy) return;

  studioRequestBusy = true;

  const sendBtn = document.getElementById("btnStudioSend");
  if (sendBtn) sendBtn.disabled = true;

  let activeChat = getActiveStudioChat(getStudioData());

  if (!activeChat) {
    activeChat = createNewStudioChat("New Innovator Chat");
  }

  const chatId = activeChat.id;

  addStudioMessage(chatId, "user", text);

  renderStudio();
  showStudioTyping();

  try {
    await loadNSAAIStudioSources();

    const chat = getStudioData().chats.find(
      c => c.id === chatId
    );

    const history = (chat?.messages || [])
      .slice(-12)
      .map(m => ({
        role: m.role,
        text: m.text
      }));

    // Send the conversation and assigned innovator.
    const response = await fetch(
      '/.netlify/functions/studio-ai',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: history,
          innovatorId: chat?.innovatorId || null
        })
      }
    );

    const payload = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error || 'Studio AI is temporarily unavailable.'
      );
    }

    // Save the innovator identity in this chat.
    if (payload.innovator) {
      const data = getStudioData();

      const currentChat = data.chats.find(
        c => c.id === chatId
      );

      if (currentChat) {
        currentChat.innovatorId =
          payload.innovator.id;

        currentChat.innovatorName =
          payload.innovator.name;

        currentChat.innovatorAchievement =
          payload.innovator.achievement || null;

        currentChat.innovatorSource =
          payload.innovator.source || null;

        currentChat.updatedAt =
          new Date().toISOString();

        saveStudioData(data);
      }
    }

    addStudioMessage(
      chatId,
      'assistant',
      payload.reply || 'Could you tell me a little more?'
    );

  } catch (err) {
    addStudioMessage(
      chatId,
      'assistant',
      `Studio AI couldn't connect right now. ${
        err.message || 'Please try again shortly.'
      }`
    );

  } finally {
    hideStudioTyping();
    studioRequestBusy = false;

    if (sendBtn) sendBtn.disabled = false;

    renderStudio();
  }
}


let STUDIO_BOUND = false;


function getStudioPage(){
  return $("#sub-studio .studio-page");
}

function isStudioMobile(){
  return window.innerWidth <= 980;
}

function openStudioSidebar(){
  const page = getStudioPage();
  if (!page) return;

  if (isStudioMobile()){
    page.classList.add("sidebar-open");
  } else {
    page.classList.remove("sidebar-collapsed");
  }
}

function closeStudioSidebar(){
  const page = getStudioPage();
  if (!page) return;

  if (isStudioMobile()){
    page.classList.remove("sidebar-open");
  } else {
    page.classList.add("sidebar-collapsed");
  }
}

function toggleStudioSidebar(){
  const page = getStudioPage();
  if (!page) return;

  if (isStudioMobile()){
    page.classList.toggle("sidebar-open");
  } else {
    page.classList.toggle("sidebar-collapsed");
  }
}

function resetStudioSidebarForViewport(){
  const page = getStudioPage();
  if (!page) return;

  if (isStudioMobile()){
    page.classList.remove("sidebar-collapsed");
    page.classList.remove("sidebar-open");
  } else {
    page.classList.remove("sidebar-open");
  }
}


function bindStudioOnce(){
  if (STUDIO_BOUND) return;

  const btnSidebarToggle = $("#btnStudioSidebarToggle");
const btnSidebarClose = $("#btnStudioSidebarClose");
const sidebarBackdrop = $("#studioSidebarBackdrop");
  const form = $("#studioForm");
  const input = $("#studioInput");
  const chatList = $("#studioChatList");
  const search = $("#studioChatSearch");
  const btnNewSide = $("#btnStudioNewChatSide");
  const btnRename = $("#btnRenameStudioChat");
  const btnDelete = $("#btnDeleteStudioChat");
  const btnPromptIdeas = $("#btnStudioPromptIdeas");

  if (!form || !input || !chatList) return;

  STUDIO_BOUND = true;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoResizeStudioInput();
    await submitStudioPrompt(text);
    input.focus();
  });

  input.addEventListener("input", autoResizeStudioInput);

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      autoResizeStudioInput();
      await submitStudioPrompt(text);
      input.focus();
    }
  });
  
  if (btnSidebarToggle){
  btnSidebarToggle.addEventListener("click", () => {
    toggleStudioSidebar();
  });
}

if (btnSidebarClose){
  btnSidebarClose.addEventListener("click", () => {
    closeStudioSidebar();
  });
}

if (sidebarBackdrop){
  sidebarBackdrop.addEventListener("click", () => {
    closeStudioSidebar();
  });
}

  if (search){
    search.addEventListener("input", renderStudio);
  }

  if (btnNewSide){
    btnNewSide.addEventListener("click", () => {
      createNewStudioChat("Innovator Chat");
      renderStudio();
      if (isStudioMobile()) closeStudioSidebar();
      input.focus();
    });
  }

  if (btnRename){
    btnRename.addEventListener("click", () => {
      const activeChat = getActiveStudioChat();
      if (!activeChat) return;
      const title = prompt("Rename this chat:", activeChat.title || "New Innovator Chat");
      if (!title || !title.trim()) return;
      renameStudioChat(activeChat.id, title.trim());
      renderStudio();
    });
  }

  if (btnDelete){
    btnDelete.addEventListener("click", () => {
      const activeChat = getActiveStudioChat();
      if (!activeChat) return;
      const ok = confirm(`Delete "${activeChat.title}"?`);
      if (!ok) return;
      deleteStudioChat(activeChat.id);
      renderStudio();
    });
  }

  if (btnPromptIdeas){
    btnPromptIdeas.addEventListener("click", () => {
      const input = $("#studioInput");
      if (!input) return;
      input.value = rp(getStudioPromptSuggestions());
      autoResizeStudioInput();
      input.focus();
    });
  }

chatList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-chat-id]");
  if (!btn) return;
  setActiveStudioChat(btn.dataset.chatId);
  renderStudio();
  if (isStudioMobile()) closeStudioSidebar();
});

  document.addEventListener("click", async (e) => {
    const suggestion = e.target.closest(".studio-suggestion-card[data-studio-prompt]");
    if (!suggestion) return;
    await submitStudioPrompt(suggestion.dataset.studioPrompt || "");
    input.focus();
  });
}

/* =======================================================
   Music Dock (Culture TV embedded + persistent)
======================================================= */
const CULTURE_TV_URL = "https://rad-cat-257e36.netlify.app/";

let cultureTvLoaded = false;
let cultureTvReady = false;
let cultureTvLoading = false;
let cultureTvRetryCount = 0;
let cultureTvLoadTimer = null;

function getCultureTvFrame(){
  return $("#cultureTvFrame");
}

function getMusicDock(){
  return $("#musicDock");
}

function setMusicDockTitle(text){
  const titleEl = document.querySelector(".music-dock-title");
  if (titleEl) titleEl.textContent = text;
}

function clearCultureTvLoadTimer(){
  if (cultureTvLoadTimer){
    clearTimeout(cultureTvLoadTimer);
    cultureTvLoadTimer = null;
  }
}

function markCultureTvReady(){
  cultureTvLoaded = true;
  cultureTvReady = true;
  cultureTvLoading = false;
  cultureTvRetryCount = 0;
  clearCultureTvLoadTimer();
  setMusicDockTitle("Culture TV");
}

function markCultureTvLoading(){
  cultureTvLoading = true;
  cultureTvReady = false;
  setMusicDockTitle("Culture TV • Loading...");
}

function buildCultureTvUrl(){
  return CULTURE_TV_URL;
}

/**
 * Force reload helper:
 * only use when the iframe seems blank / not ready
 */
function forceReloadCultureTv(){
  const frame = getCultureTvFrame();
  if (!frame) return;

  cultureTvLoaded = false;
  cultureTvReady = false;
  cultureTvLoading = true;

  clearCultureTvLoadTimer();
  setMusicDockTitle("Culture TV • Reloading...");

  // hard reset first, then reload
  frame.src = "about:blank";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      frame.src = buildCultureTvUrl();
      startCultureTvReadyTimeout();
    });
  });
}

function startCultureTvReadyTimeout(){
  clearCultureTvLoadTimer();

  cultureTvLoadTimer = setTimeout(() => {
    // If iframe still doesn't seem ready, retry once
    if (!cultureTvReady && cultureTvRetryCount < 1){
      cultureTvRetryCount++;
      forceReloadCultureTv();
    } else if (!cultureTvReady){
      cultureTvLoading = false;
      setMusicDockTitle("Culture TV");
    }
  }, 5000);
}

function ensureCultureTvLoaded(forceReload = false){
  const frame = getCultureTvFrame();
  if (!frame) return;

  if (forceReload){
    forceReloadCultureTv();
    return;
  }

  // Already good
  if (cultureTvReady || cultureTvLoading) return;

  // First load
  markCultureTvLoading();

  const currentSrc = frame.getAttribute("src") || "";
  if (!currentSrc){
    frame.src = buildCultureTvUrl();
  }

  startCultureTvReadyTimeout();
}

function initCultureTvPreload(){
  const frame = getCultureTvFrame();
  if (!frame || frame.dataset.bound === "1") return;

  frame.dataset.bound = "1";

  frame.addEventListener("load", () => {
    markCultureTvReady();
  });

  frame.addEventListener("error", () => {
    cultureTvReady = false;
    cultureTvLoading = false;
    setMusicDockTitle("Culture TV");
  });

  // Preload immediately so Music is ready before the user opens it
  ensureCultureTvLoaded(false);
}

function openMusicDock(){
  const dock = getMusicDock();
  const frame = getCultureTvFrame();
  if (!dock || !frame) return;

  // Make sure preload system is active
  initCultureTvPreload();

  // If the iframe somehow has no src, load it
  const currentSrc = frame.getAttribute("src") || "";
  if (!currentSrc){
    ensureCultureTvLoaded(false);
  }

  dock.classList.add("open");
  dock.setAttribute("aria-hidden", "false");

  // If it still isn't ready when user opens it, retry once
  if (!cultureTvReady && !cultureTvLoading){
    ensureCultureTvLoaded(false);
  }
}

function closeMusicDock(){
  const dock = getMusicDock();
  if (!dock) return;

  // IMPORTANT: do NOT clear iframe src
  dock.classList.remove("open");
  dock.setAttribute("aria-hidden", "true");
  setMusicDockTitle("Culture TV");
}

function bindMusicDockButtons(){
  const backBtn = $("#musicBackBtn");
  const minBtn  = $("#musicMinBtn");

  if (backBtn && !backBtn.dataset.bound){
    backBtn.dataset.bound = "1";
    backBtn.addEventListener("click", () => {
      closeMusicDock();
      goto("dashboard");
      subnav(STATE.lastSubpage || "home");
    });
  }

  if (minBtn && !minBtn.dataset.bound){
    minBtn.dataset.bound = "1";
    minBtn.addEventListener("click", () => {
      closeMusicDock();
      goto("dashboard");
      subnav(STATE.lastSubpage || "home");
    });
  }
}

/* =======================================================
   Side Menu Helpers (NEW)
======================================================= */
function getSideMenuEls(){
  return {
    menu: $("#sideMenu"),
    backdrop: $("#sideMenuBackdrop"),
    toggle: $("#sideMenuToggle"),
    close: $("#sideMenuClose"),
    homeOpen: $("#homeOpenMenuBtn")
  };
}

function isDesktopMenuMode(){
  return window.innerWidth > 980;
}

function openSideMenu(){
  // Desktop: reveal collapsed sidebar instead of drawer behavior
  if (isDesktopMenuMode()){
    setMenuCollapsed(false);
    return;
  }

  const { menu, backdrop } = getSideMenuEls();
  if (menu) menu.classList.add("open");
  if (backdrop) backdrop.classList.add("show");
  document.body.classList.add("menu-open");
}

function closeSideMenu(){
  // Desktop: collapse the sidebar when X is clicked
  if (isDesktopMenuMode()){
    setMenuCollapsed(true);
    return;
  }

  const { menu, backdrop } = getSideMenuEls();
  if (menu) menu.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
  document.body.classList.remove("menu-open");
}

function syncSideMenuActive(key){
  $$(".side-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.nav === key);
  });
}

function syncSideProfile(){
  if (!STATE.me) return;

  const sideName = $("#sideMeName");
  const sideSchool = $("#sideMeSchool");

  if (sideName) sideName.textContent = STATE.me.name || "Member";
  if (sideSchool) sideSchool.textContent = STATE.me.school || "";

  const src = STATE.me?.photoURL || store.get(getAvatarStorageKey(), null);
  setAvatarPreview(src || "");
}

function getAppShell(){
  return $(".app-shell");
}

function setMenuCollapsed(collapsed){
  const shell = getAppShell();
  const collapseBtn = $("#sideMenuCollapseBtn");
  const revealBtn = $("#sideMenuRevealBtn");

  if (!shell) return;

  const shouldCollapse = !!collapsed && isDesktopMenuMode();
  shell.classList.toggle("menu-collapsed", shouldCollapse);

  if (collapseBtn){
    collapseBtn.setAttribute("aria-label", shouldCollapse ? "Show menu" : "Hide menu");
    collapseBtn.setAttribute("title", shouldCollapse ? "Show menu" : "Hide menu");
    collapseBtn.textContent = "‹";
  }

  if (revealBtn){
    revealBtn.setAttribute("aria-label", "Show menu");
    revealBtn.setAttribute("title", "Show menu");
  }

  store.set(SIDE_MENU_COLLAPSED_KEY, !!collapsed);
}

function getSavedMenuCollapsed(){
  return !!store.get(SIDE_MENU_COLLAPSED_KEY, false);
}

function toggleDesktopMenuCollapsed(){
  if (!isDesktopMenuMode()) return;
  const shell = getAppShell();
  if (!shell) return;

  const next = !shell.classList.contains("menu-collapsed");
  setMenuCollapsed(next);
}

function applySavedMenuState(){
  // On mobile, always use drawer mode only
  if (!isDesktopMenuMode()){
    const shell = getAppShell();
    if (shell) shell.classList.remove("menu-collapsed");
    return;
  }

  setMenuCollapsed(getSavedMenuCollapsed());
}

/* =======================================================
   Router (pages & subpages) + hash routing
======================================================= */
function goto(page){
  $$(".page").forEach(p => p.classList.remove("active"));
  const target = $("#page-" + page);
  if (target) target.classList.add("active");

  const inDash = page === "dashboard";

  const themeBtn = $("#themeToggle");
  if (themeBtn) themeBtn.classList.toggle("hidden", inDash);

  const footer = $("#globalFooter");
  if (footer) footer.classList.toggle("hidden", inDash);

  const authNav = $(".auth");
  if (authNav) authNav.classList.toggle("hidden", inDash);
  
    const notifBtn = $("#notifBtn");
  const notifPanel = $("#notifPanel");

  if (notifBtn) notifBtn.classList.toggle("hidden", !inDash || !STATE.me);
  if (notifPanel && (!inDash || !STATE.me)) closeNotifPanel();

  if (!inDash){
    closeSideMenu();
  }

  if (page === "dashboard"){
    syncSideProfile();

    const activeSub = $(".subpage.active");
    if (!activeSub){
      subnav("home");
    } else {
      const id = activeSub.id || "";
      const key = id.startsWith("sub-") ? id.replace("sub-","") : "home";
      syncSideMenuActive(key);
      buildBottomNav(key);
    }
  } else {
    buildBottomNav(null);
    syncHash(page);
  }
}
function subnav(key){
  const currentActive = $(".subpage.active");
    const currentStudyOpen = $("#sub-study")?.classList.contains("active");
  if (currentStudyOpen && key !== "study"){
    saveActiveStudyNoteNow();
  }
  if (currentActive){
    const id = currentActive.id || "";
    const currentKey = id.startsWith("sub-") ? id.replace("sub-","") : "";
    if (currentKey && currentKey !== "music"){
      STATE.lastSubpage = currentKey;
    }
  }

  $$(".subpage").forEach(s => s.classList.remove("active"));
  const sub = $("#sub-" + key);
  if (sub) sub.classList.add("active");

  const appHeader = $(".app-header");
  if (key === "home" || key === "feed"){
    if (appHeader) appHeader.classList.add("hidden");
  } else {
    if (appHeader) appHeader.classList.remove("hidden");
  }

  syncSideMenuActive(key);
  syncSideProfile();

  if (key === "home") renderHome();
  if (key === "friends") renderFriends();
    if (key === "feed") {
    bindCommunityOnce();
    renderFeed();
  }
    if (key === "calendar") {
    renderEvents();
    updateCalendarSummary();
    renderVisualCalendar();
  }
    if (key === "membership") { bindMembershipOnce(); renderMembership(); }

  if (key === "study") { renderStudy(); bindStudyOnce(); }
  if (key === "jobs") renderJobs();
  if (key === "campus") renderCampuses();
if (key === "studio") {
  fillChemistrySelects();
  renderStudio();
  bindStudioOnce();
  resetStudioSidebarForViewport();
}
  if (key === "culture") showCard(0);
  if (key === "quests") renderQuests();
  if (key === "partners") renderPartners();
  if (key === "scholarships") renderScholarships();
  if (key === "mentors") renderMentors();
  if (key === "projects") renderProjects();
  if (key === "playbook") renderPlaybook();
  if (key === "wellness") renderWellness();

  if (key === "music"){
    openMusicDock();
  } else {
    closeMusicDock();
  }

  syncHash("dashboard", key);
  buildBottomNav(key);
  closeSideMenu();
}
function syncHash(page, sub) {
  // Public pages keep their simple hashes
  if (page !== "dashboard") {
    location.hash = `#/${page}`;
    return;
  }

  // Dashboard routes must be namespaced to avoid colliding with public routes
  location.hash = `#/dashboard/${sub || "home"}`;
}

window.addEventListener('hashchange', () => {
  const [, p, sub] = (location.hash || '#/home').split('/');
  if (['home','signup','login','members'].includes(p)) return goto(p);
  if (p==='dashboard'){ goto('dashboard'); if(sub) subnav(sub); }
});
/* ===========================================
   Pitch Coach: Voice Input
=========================================== */

let pitchRecognition = null;
let pitchRecognizing = false;

function setupPitchVoice() {
  const btn = $("#btnPitchVoice");
  const status = $("#pitchVoiceStatus");
  const input = $("#pitchInput");

  if (!btn || !input) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.style.display = "none";
    if (status) {
      status.textContent = "Voice input not supported in this browser.";
    }
    return;
  }

  pitchRecognition = new SR();
  pitchRecognition.lang = "en-US";
  pitchRecognition.continuous = false;
  pitchRecognition.interimResults = false;

  pitchRecognition.onstart = () => {
    pitchRecognizing = true;
    btn.textContent = "⏹ Stop Listening";
    if (status) status.textContent = "Listening… speak your 60-sec pitch.";
  };

  pitchRecognition.onend = () => {
    pitchRecognizing = false;
    btn.textContent = "🎙️ Speak Pitch";
  };

  pitchRecognition.onerror = () => {
    pitchRecognizing = false;
    btn.textContent = "🎙️ Speak Pitch";
    if (status) status.textContent = "Could not access microphone. Check permissions.";
  };

  pitchRecognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join(" ");

    input.value = (input.value ? input.value + " " : "") + transcript;

    if (status) status.textContent = "Transcript added.";
  };

  btn.addEventListener("click", () => {
    if (pitchRecognizing) {
      pitchRecognition.stop();
    } else {
      if (status) status.textContent = "";
      pitchRecognition.start();
    }
  });
}

function bindCommunityOnce(){
  const subFeed = $("#sub-feed");
  if (!subFeed || subFeed.dataset.communityBound === "1") return;

  subFeed.dataset.communityBound = "1";

  const feedSort = $("#feedSort");
  if (feedSort){
    feedSort.addEventListener("change", renderFeed);
  }
  
  const feedFilter = $("#feedFilter");
if (feedFilter){
  feedFilter.addEventListener("change", renderFeed);
}

  const storiesLeft = $("#storiesScrollLeft");
  if (storiesLeft){
    storiesLeft.addEventListener("click", () => scrollStories("left"));
  }

  const storiesRight = $("#storiesScrollRight");
  if (storiesRight){
    storiesRight.addEventListener("click", () => scrollStories("right"));
  }
  
  const storyViewClose = $("#storyViewClose");
if (storyViewClose){
  storyViewClose.addEventListener("click", () => {
    $("#storyViewDialog")?.close();
  });
}

  const addStoryBtn = $("#communityAddStoryBtn");
  if (addStoryBtn){
    addStoryBtn.addEventListener("click", openStoryDialog);
  }

  const startPostBtn = $("#communityStartPostBtn");
  if (startPostBtn){
    startPostBtn.addEventListener("click", focusCommunityComposer);
  }

  const fakeTrigger = $("#fakeComposerTrigger");
  if (fakeTrigger){
    fakeTrigger.addEventListener("click", focusCommunityComposer);
  }

  const attachStoryBtn = $("#attachStoryBtn");
  if (attachStoryBtn){
    attachStoryBtn.addEventListener("click", openStoryDialog);
  }

  const attachImageBtn = $("#attachImageBtn");
  if (attachImageBtn){
    attachImageBtn.addEventListener("click", () => {
      $("#postMedia")?.click();
    });
  }

  const attachVideoBtn = $("#attachVideoBtn");
  if (attachVideoBtn){
    attachVideoBtn.addEventListener("click", () => {
      $("#postMedia")?.click();
    });
  }

  const storyForm = $("#storyForm");
  if (storyForm){
    storyForm.addEventListener("submit", onSubmitStory);
  }

  const storyCancel = $("#storyCancel");
  if (storyCancel){
    storyCancel.addEventListener("click", closeStoryDialog);
  }

  const storyCloseBtn = $("#storyCloseBtn");
  if (storyCloseBtn){
    storyCloseBtn.addEventListener("click", closeStoryDialog);
  }

  const storiesRail = $("#storiesRail");
  if (storiesRail){
    storiesRail.addEventListener("click", onStoryCardClick);
  }
}


/* =======================================================
   Boot
======================================================= */

/* =======================================================
   Profile Photo Expand Modal
======================================================= */

function ensurePhotoExpandDialog(){
  let dlg = $("#photoExpandDialog");
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "photoExpandDialog";
  dlg.innerHTML = `
    <div class="photo-expand-modal">
      <button id="photoExpandClose" class="chip photo-expand-close" type="button">✕</button>
      <img id="photoExpandImg" class="photo-expand-img hidden" alt="Expanded profile photo" />
      <div id="photoExpandFallback" class="photo-expand-fallback hidden">👤</div>
    </div>
  `;

  document.body.appendChild(dlg);

  $("#photoExpandClose").addEventListener("click", () => dlg.close());

  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  return dlg;
}

function openExpandedProfilePhoto(src, fallbackText = "👤"){
  const dlg = ensurePhotoExpandDialog();
  const img = $("#photoExpandImg");
  const fallback = $("#photoExpandFallback");

  if (!dlg || !img || !fallback) return;

  if (src){
    img.src = src;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    img.removeAttribute("src");
    img.classList.add("hidden");
    fallback.textContent = fallbackText || "👤";
    fallback.classList.remove("hidden");
  }

  if (!dlg.open) dlg.showModal();
}

function bindProfilePhotoExpandOnce(){
  if (document.body.dataset.profilePhotoExpandBound === "1") return;
  document.body.dataset.profilePhotoExpandBound = "1";

  document.addEventListener("click", (e) => {
        if (e.target.closest("#storiesRail, .story-card, .story-avatar")){
      return;
    }
    const avatar = e.target.closest(
      ".avatar, .avatar-preview, .featured-avatar, .story-avatar, #fpAvatar, #meInitial, #sideMeInitial, #communityComposerAvatar"
    );

    if (!avatar) return;

    const img = avatar.querySelector("img");
    const src = img?.getAttribute("src") || "";
    const fallbackText = avatar.textContent.trim() || "👤";

    e.preventDefault();
    e.stopPropagation();

    openExpandedProfilePhoto(src, fallbackText);
  }, true);
}

window.addEventListener("DOMContentLoaded", () => {
  syncTopbarHeight();

  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("orientationchange", syncTopbarHeight);

  setupPitchVoice();
bindMusicDockButtons();
initCultureTvPreload();
bindDemoInterestPopupOnce();
   $("#year").textContent = new Date().getFullYear();
  
    // Theme init + toggle binding
  applyTheme(getPreferredTheme());
  const themeBtn = $("#themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  
    // Notifications
  const notifBtn = $("#notifBtn");
  const notifPanel = $("#notifPanel");
  const notifMarkRead = $("#notifMarkRead");
  const notifList = $("#notifList");

    if (STATE.me){
    ensureNotificationsSeeded();
    renderNotifications();
  } else {
    if (notifBtn) notifBtn.classList.add("hidden");
  }

  if (notifBtn){
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotifPanel();
    });
  }

  if (notifPanel){
    notifPanel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (notifMarkRead){
    notifMarkRead.addEventListener("click", () => {
      markAllNotificationsRead();
    });
  }

  if (notifList){
    notifList.addEventListener("click", (e) => {
      const item = e.target.closest(".notif-item[data-id]");
      if (!item) return;

      markNotificationRead(item.dataset.id);
    });
  }

  document.addEventListener("click", () => {
    closeNotifPanel();
  });
  
  bindLockedFeatureDialogOnce();

const memberLoginForm = $("#memberLoginForm");
if (memberLoginForm){
  memberLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Member login demo: in the full version, this will connect to your member account.");
    goto("dashboard");
    subnav("membership");
  });
}
  
  
// ✅ Profile: save + avatar upload + crop
const avatarInput = $("#avatarInput");
if (avatarInput) avatarInput.addEventListener("change", onAvatarChange);

const chooseAvatarBtn = $("#chooseAvatarBtn");
if (chooseAvatarBtn){
  chooseAvatarBtn.addEventListener("click", () => {
    $("#avatarInput")?.click();
  });
}

const removeAvatarBtn = $("#removeAvatarBtn");
if (removeAvatarBtn){
  removeAvatarBtn.addEventListener("click", removeAvatar);
}

const avatarCropClose = $("#avatarCropClose");
if (avatarCropClose){
  avatarCropClose.addEventListener("click", closeAvatarCropDialog);
}

const avatarCropCancel = $("#avatarCropCancel");
if (avatarCropCancel){
  avatarCropCancel.addEventListener("click", closeAvatarCropDialog);
}

const avatarCropApply = $("#avatarCropApply");
if (avatarCropApply){
  avatarCropApply.addEventListener("click", applyAvatarCrop);
}

const profileForm = $("#profileForm");
if (profileForm) profileForm.addEventListener("submit", onSaveProfile);
  
  const avatarZoomRange = $("#avatarZoomRange");
if (avatarZoomRange){
  avatarZoomRange.addEventListener("input", (e) => {
    const nextScale = Number(e.target.value || 1);
    AVATAR_CROP_STATE.scale = clamp(nextScale, AVATAR_CROP_STATE.minScale, AVATAR_CROP_STATE.maxScale);
    clampAvatarPosition();
    updateAvatarCropTransform();
  });
}
  
  
  const avatarCropViewport = $("#avatarCropViewport");
if (avatarCropViewport){
  const onPointerDown = (e) => {
    if (!AVATAR_CROP_STATE.open) return;
    AVATAR_CROP_STATE.dragging = true;
    AVATAR_CROP_STATE.dragStartX = e.clientX;
    AVATAR_CROP_STATE.dragStartY = e.clientY;
    AVATAR_CROP_STATE.startX = AVATAR_CROP_STATE.x;
    AVATAR_CROP_STATE.startY = AVATAR_CROP_STATE.y;
    avatarCropViewport.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!AVATAR_CROP_STATE.dragging) return;

    const dx = e.clientX - AVATAR_CROP_STATE.dragStartX;
    const dy = e.clientY - AVATAR_CROP_STATE.dragStartY;

    AVATAR_CROP_STATE.x = AVATAR_CROP_STATE.startX + dx;
    AVATAR_CROP_STATE.y = AVATAR_CROP_STATE.startY + dy;

    clampAvatarPosition();
    updateAvatarCropTransform();
  };

  const onPointerUp = (e) => {
    AVATAR_CROP_STATE.dragging = false;
    avatarCropViewport.releasePointerCapture?.(e.pointerId);
  };

  avatarCropViewport.addEventListener("pointerdown", onPointerDown);
  avatarCropViewport.addEventListener("pointermove", onPointerMove);
  avatarCropViewport.addEventListener("pointerup", onPointerUp);
  avatarCropViewport.addEventListener("pointercancel", onPointerUp);
}


  
    // Bottom Nav customization controls (Home page button)
  const btnCustomize = $("#btnCustomizeBottomNav");
  if (btnCustomize) btnCustomize.addEventListener("click", openBottomNavDialog);

  const bottomClose = $("#bottomNavClose");
  if (bottomClose) bottomClose.addEventListener("click", () => $("#bottomNavDialog").close());

  const bottomReset = $("#bottomNavReset");
  if (bottomReset) bottomReset.addEventListener("click", () => {
    resetBottomNav();
    // also refresh the dropdowns if dialog is open
    openBottomNavDialog();
  });

  const bottomForm = $("#bottomNavForm");
  if (bottomForm) bottomForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveBottomNavFromDialog();
  });


  // Home & top auth routes
  $$("[data-nav='home']").forEach(b => {
  b.addEventListener("click", () => {
    if (STATE.me){
      goto("dashboard");
      subnav("home");
    } else {
      goto("home");
    }

    scrollAppToTop();
  });
});
  $("#btnToSignup").addEventListener("click",()=>goto("signup"));
  $("#btnToLogin").addEventListener("click",()=>goto("login"));
  $("#ctaStart").addEventListener("click",()=>goto("signup"));
  $("#ctaDemo").addEventListener("click", demoLogin);

    // Side menu controls
   // Side menu controls
  const sideMenuToggle = $("#sideMenuToggle");
  const sideMenuClose = $("#sideMenuClose");
  const sideMenuBackdrop = $("#sideMenuBackdrop");
  const sideMenuCollapseBtn = $("#sideMenuCollapseBtn");
  const sideMenuRevealBtn = $("#sideMenuRevealBtn");
  

  if (sideMenuToggle){
    sideMenuToggle.addEventListener("click", openSideMenu);
  }

  if (sideMenuClose){
    sideMenuClose.addEventListener("click", closeSideMenu);
  }

  if (sideMenuBackdrop){
    sideMenuBackdrop.addEventListener("click", closeSideMenu);
  }
  
    if (sideMenuCollapseBtn){
    sideMenuCollapseBtn.addEventListener("click", () => {
      toggleDesktopMenuCollapsed();
    });
  }

  if (sideMenuRevealBtn){
    sideMenuRevealBtn.addEventListener("click", () => {
      setMenuCollapsed(false);
    });
  }


  
    applySavedMenuState();

   window.addEventListener("resize", () => {
    applySavedMenuState();

    const { studySidebar, btnToggleStudySidebar } = getStudyEls();
    if (!studySidebar) return;

    if (!isStudyMobile()){
      studySidebar.classList.remove("open");
      if (btnToggleStudySidebar){
        btnToggleStudySidebar.setAttribute("aria-expanded", "false");
        btnToggleStudySidebar.textContent = "☰ Subjects & Notes";
      }
    }
  });

  // Sidebar navigation
  $$(".side-link").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const key = btn.dataset.nav;
      if (!key) return;
      goto("dashboard");
      if (NS_LOCKED_FEATURES.includes(key)){
  openLockedFeatureDialog(key);
  subnav(key);
scrollAppToTop();
  return;
}
      subnav(key);
    });
  });
  
  // Generic router for tab clicks & links with data-nav
  $$("[data-nav]").forEach(el => {
    el.addEventListener("click", (e) => {
      const key = el.getAttribute("data-nav");
      if (!key) return;

      // Let dedicated side-link handler manage sidebar clicks
      if (el.classList.contains("side-link")) return;

      if (el.tagName === "A" || el.dataset.nav === "profile"){
        e.preventDefault();
      }

if (["friends","feed","calendar","membership","study","jobs","campus","studio","culture","music","quests","partners","socials","profile","scholarships","mentors","projects","playbook","wellness","home"].includes(key)){
  goto("dashboard");
  subnav(key);
  scrollAppToTop();
} else if (["public","signup","login","members"].includes(key)){
  goto(key === "public" ? "home" : key);
  scrollAppToTop();
}
    });
  });
  // Auth flows
  $("#signupForm").addEventListener("submit", onSignup);
  $("#loginForm").addEventListener("submit", onLogin);
  $("#linkForgot").addEventListener("click", (e)=>{e.preventDefault(); $("#forgotDialog").showModal();});
  $("#forgotCancel").addEventListener("click", ()=> $("#forgotDialog").close());
  $("#forgotForm").addEventListener("submit", onForgotPassword);

  // Subnav tabs
 

// Analytics
const btnAnalytics = $("#btnAnalytics");
const closeAnalyticsBtn = $("#closeAnalytics");

if (btnAnalytics) btnAnalytics.addEventListener("click", openAnalytics);
if (closeAnalyticsBtn) closeAnalyticsBtn.addEventListener("click", closeAnalytics);

    // Feed / Community
  $("#composer").addEventListener("submit", onPost);
  $("#feedFilter").addEventListener("change", renderFeed);
  bindCommunityOnce();
    bindMembershipOnce();


 // Calendar
const btnCreateEvent = $("#btnCreateEvent");
const eventCancel = $("#eventCancel");
const eventForm = $("#eventForm");

if (btnCreateEvent){
  btnCreateEvent.addEventListener("click", () => {
    const form = $("#eventForm");
    if (form) form.reset();

    resetEventVisibilityToggle();

    const dialog = $("#eventDialog");
    if (dialog) dialog.showModal();
  });
}

if (eventCancel){
  eventCancel.addEventListener("click", () => $("#eventDialog").close());
}

if (eventForm){
  eventForm.addEventListener("submit", onCreateEvent);
}

const btnOpenVisualCalendar = $("#btnOpenVisualCalendar");
const calendarDialogClose = $("#calendarDialogClose");
const calendarJumpToday = $("#calendarJumpToday");
const calendarPrevMonth = $("#calendarPrevMonth");
const calendarNextMonth = $("#calendarNextMonth");
const calendarMonthViewBtn = $("#calendarMonthViewBtn");
const calendarYearViewBtn = $("#calendarYearViewBtn");
const calendarAddFromDay = $("#calendarAddFromDay");
const calendarGrid = $("#calendarGrid");
const calendarYearGrid = $("#calendarYearGrid");
const calendarViewDialog = $("#calendarViewDialog");

if (btnOpenVisualCalendar){
  btnOpenVisualCalendar.addEventListener("click", openVisualCalendar);
}

if (calendarDialogClose){
  calendarDialogClose.addEventListener("click", closeVisualCalendar);
}

if (calendarJumpToday){
  calendarJumpToday.addEventListener("click", () => {
    const now = new Date();
    STATE.calendarSelectedDate = new Date(now);
    STATE.calendarViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderVisualCalendar();
  });
}

if (calendarPrevMonth){
  calendarPrevMonth.addEventListener("click", () => {
    const d = STATE.calendarViewDate || new Date();
    STATE.calendarViewDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    renderVisualCalendar();
  });
}

if (calendarNextMonth){
  calendarNextMonth.addEventListener("click", () => {
    const d = STATE.calendarViewDate || new Date();
    STATE.calendarViewDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    renderVisualCalendar();
  });
}

if (calendarMonthViewBtn){
  calendarMonthViewBtn.addEventListener("click", () => {
    STATE.calendarViewMode = "month";
    syncCalendarViewMode();
  });
}

if (calendarYearViewBtn){
  calendarYearViewBtn.addEventListener("click", () => {
    STATE.calendarViewMode = "year";
    syncCalendarViewMode();
  });
}

if (calendarAddFromDay){
  calendarAddFromDay.addEventListener("click", prefillEventDialogForSelectedDay);
}

if (calendarGrid){
  calendarGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".calendar-day");
    if (!btn) return;

    const key = btn.dataset.date;
    if (!key) return;

    const selected = new Date(`${key}T12:00:00`);
    STATE.calendarSelectedDate = selected;
    STATE.calendarViewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderVisualCalendar();
  });
}

if (calendarYearGrid){
  calendarYearGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-year-date]");
    if (!btn) return;

    const key = btn.dataset.yearDate;
    if (!key) return;

    const selected = new Date(`${key}T12:00:00`);
    STATE.calendarSelectedDate = selected;
    STATE.calendarViewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
    STATE.calendarViewMode = "month";
    renderVisualCalendar();
  });
}

if (calendarViewDialog){
  calendarViewDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeVisualCalendar();
  });
}

  // Scholarships, jobs, campuses, mentors, partners, projects, playbook
  $("#schSearch").addEventListener("input", renderScholarships);
  $("#jobSearch").addEventListener("input", renderJobs);
  $("#campusSearch").addEventListener("input", renderCampuses);
$("#campusList").addEventListener("click", onCampusClick);

const campusFavoritesBtn = $("#campusFavoritesBtn");
if (campusFavoritesBtn){
  campusFavoritesBtn.addEventListener("click", toggleCampusFavoritesMode);
}
    $("#mentorSearch").addEventListener("input", renderMentors);
  $("#mentorFilter").addEventListener("change", renderMentors);

  const btnBecomeMentor = $("#btnBecomeMentor");
  const mentorApplyClose = $("#mentorApplyClose");
  const mentorApplyCancel = $("#mentorApplyCancel");
  const mentorApplyForm = $("#mentorApplyForm");

  if (btnBecomeMentor){
    btnBecomeMentor.addEventListener("click", openMentorApplyDialog);
  }

  if (mentorApplyClose){
    mentorApplyClose.addEventListener("click", closeMentorApplyDialog);
  }

  if (mentorApplyCancel){
    mentorApplyCancel.addEventListener("click", closeMentorApplyDialog);
  }

  if (mentorApplyForm){
    mentorApplyForm.addEventListener("submit", onMentorApplySubmit);
  }

  $("#partnerSearch").addEventListener("input", renderPartners);
  $("#projectSearch").addEventListener("input", renderProjects);
  $("#projectFilter").addEventListener("change", renderProjects);

  // Directory search + modes
  $("#friendSearchBtn").addEventListener("click", renderFriends);
  $("#friendSearch").addEventListener("input", renderFriends);
  $("#friendRecsBtn").addEventListener("click", () => {
    STATE.recsMode = !STATE.recsMode;
    $("#friendRecsBtn").classList.toggle("btn-primary", STATE.recsMode);
    $("#friendRecsBtn").classList.toggle("btn-outline", !STATE.recsMode);
    renderFriends();
  });
  $("#friendConnectionsBtn").addEventListener("click", openConnectionsDialog);
  $("#friendMessagesBtn").addEventListener("click", openMessagesDialog);

  // Directory profile / connect / message from list
$("#friendList").addEventListener("click", async (e) => {
  const item = e.target.closest(".item");
  if (!item) return;

  const id = item.dataset.id;
  const uid = item.dataset.uid;
  const isReal = item.dataset.real === "1";

  const person = isReal
    ? REAL_USERS.find(p => p.uid === uid)
    : PEOPLE.find(p => p.id === id);

  if (!person) return;

  const btn = e.target.closest("button[data-action]");

  if (btn) {
    const action = btn.dataset.action;

    if (action === "profile") {
      openFriendProfile(person);
    } else if (action === "connect") {
      await handleRealUserConnect(person);
    } else if (action === "message") {
      sendMessageToPerson({ id: person.uid || person.id, name: person.name });
    }

    return;
  }

  openFriendProfile(person);
});

  // Friend profile dialog buttons
  $("#fpClose").addEventListener("click", () => $("#friendProfileDialog").close());
  $("#fpConnect").addEventListener("click", onConnectFromProfile);
  $("#fpMessage").addEventListener("click", onMessageFromProfile);

  // Connections & messages dialogs
  $("#connectionsClose").addEventListener("click", () => $("#connectionsDialog").close());
  $("#messagesClose").addEventListener("click", () => $("#messagesDialog").close());

  // Feed actions (likes, comments, repost)
  $("#feedList").addEventListener("click", onFeedAction);

  // Studio
 // Studio
if ($("#btnRoulette")) $("#btnRoulette").addEventListener("click", () => spinRoulette(false));
if ($("#btnRouletteRemix")) $("#btnRouletteRemix").addEventListener("click", () => spinRoulette(true));
if ($("#btnRouletteToFeed")) $("#btnRouletteToFeed").addEventListener("click", rouletteToFeed);
if ($("#btnScorePitch")) $("#btnScorePitch").addEventListener("click", scorePitch);
if ($("#btnChemistry")) $("#btnChemistry").addEventListener("click", runChemistry);

// New Studio AI chat
renderStudio();
bindStudioOnce();

  // Playbook
  $("#playSearch").addEventListener("input", renderPlaybook);
  $("#btnRandomGuide").addEventListener("click", randomGuide);

  // Wellness
  $("#btnAffirmation").addEventListener("click", newAffirmation);
  $("#btnBibleVerse").addEventListener("click", showRandomBibleVerse);
  $("#btnBreath").addEventListener("click", startBreathing);
  $("#btnCheckin").addEventListener("click", logCheckin);
  $("#btnSaveJournal").addEventListener("click", saveJournalEntry);

  // Culture
 $("#prevCard").addEventListener("click", () => showCard(-1));
$("#nextCard").addEventListener("click", () => showCard(1));

const shuffleCultureBtn = $("#shuffleCultureCard");
if (shuffleCultureBtn){
  shuffleCultureBtn.addEventListener("click", shuffleCultureCard);
}

$("#cardInspire").addEventListener("click", inspireFromCard);
bindCultureImageModal();
  bindProfilePhotoExpandOnce();

  // Projects dialog
  $("#btnNewProject").addEventListener("click", () => $("#projectDialog").showModal());
  $("#projCancel").addEventListener("click", () => $("#projectDialog").close());
  $("#projectForm").addEventListener("submit", onSaveProject);

// Jobs – Save / Apply
$("#jobList").addEventListener("click", onJobClick);

const jobSavedBtn = $("#jobSavedBtn");
if (jobSavedBtn){
  jobSavedBtn.addEventListener("click", toggleSavedJobsMode);
}

// Analytics + logout
STATE.timerStart = Date.now();
STATE.metrics = { posts:0, likes:0, rsvps:0, checkins:0, apps:0, connections:0 };

const profileLogoutBtn = $("#profileLogoutBtn");
if (profileLogoutBtn){
  profileLogoutBtn.addEventListener("click", logout);
}


// Seed in-memory collections
PEOPLE = seedPeople(140);
FEED_STATE = seedPosts.map(p => ({ ...p }));
EVENTS_STATE = seedEvents.map(e => ({ ...e }));
PROJECT_STATE = seedProjects.map(p => ({ ...p }));

  // reset seeded stories now that PEOPLE exists
   // force stories to use the same avatar system as Network
  saveStories(getSeedStories());

  // Load user if one is saved
  hydrateCurrentUser();

    document.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      closeSideMenu();
    }
  });
  
// Initial route based on hash
const [, p, sub] = (location.hash || "#/home").split("/");

if (["home","signup","login"].includes(p)) {
  goto(p);
} else if (p === "dashboard") {
  // Firebase will move logged-in users to dashboard after auth loads.
  // If not logged in, keep them on login instead of showing dashboard.
  if (auth.currentUser) {
    goto("dashboard");
    if (sub) subnav(sub);
  } else {
    goto("login");
  }
} else {
  goto("home");
}
}); 

resetStudioSidebarForViewport();

// end DOMContentLoaded


/* =======================================================
   Global in-memory collections (set in DOMContentLoaded)
======================================================= */
let PEOPLE = [];
let FEED_STATE = [];
let EVENTS_STATE = [];
let PROJECT_STATE = [];
let REAL_USERS = [];
let CONNECTION_STATE = [];

/* =======================================================
   Firebase Auth + user profile
======================================================= */

async function enterRealApp(){
  applyUserToUI();

  await refreshRealNetworkData();

  goto("dashboard");
  subnav("home");
  buildBottomNav("home");

  demoInterestHasShownThisSession = false;
  sessionStorage.removeItem(DEMO_POPUP_DISMISSED_KEY);
  scheduleDemoInterestPopup();
}

function cleanUserProfile(data = {}, firebaseUser = null){
  return {
    id: data.id || data.uid || firebaseUser?.uid || "",
    uid: data.uid || firebaseUser?.uid || "",
    name: data.name || firebaseUser?.email?.split("@")[0] || "NSAAI Member",
    email: data.email || firebaseUser?.email || "",
    school: data.school || "",
    location: data.location || "",
    skills: Array.isArray(data.skills) ? data.skills : [],
    link: data.link || "",
    bio: data.bio || "",
    photoURL: data.photoURL || "",
    membershipStatus: data.membershipStatus || "free"
  };
}

function hydrateCurrentUser(){
  onAuthStateChanged(auth, async (firebaseUser) => {
    try {
if (!firebaseUser){
  STATE.me = null;

  const [, p] = (location.hash || "#/home").split("/");

  if (p === "dashboard"){
    goto("login");
  }

  return;
}

      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()){
        STATE.me = cleanUserProfile(userSnap.data(), firebaseUser);
      } else {
        STATE.me = cleanUserProfile({}, firebaseUser);

        await setDoc(userRef, {
          ...STATE.me,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

await enterRealApp();

if (typeof loadFirebasePosts === "function"){
  await loadFirebasePosts();
}

    } catch (error){
      console.error("Auth state error:", error);
      alert("There was an issue loading your account. Please refresh and try again.");
    }
  });
}

async function onSignup(e){
  e.preventDefault();

  const fd = new FormData(e.target);

  const name = (fd.get("name") || "").trim();
  const email = (fd.get("email") || "").trim().toLowerCase();
  const password = fd.get("password");
  const school = (fd.get("school") || "").trim();
  const skills = (fd.get("skills") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (!name || !email || !password){
    alert("Please enter your name, email, and password.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = cred.user;

    const profile = {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      name,
      email,
      school,
      location: "",
      skills,
      link: "",
      bio: "",
      photoURL: "",
      membershipStatus: "free",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", firebaseUser.uid), profile);

    STATE.me = {
      ...profile,
      createdAt: null,
      updatedAt: null
    };

await enterRealApp();
e.target.reset();

  } catch (error){
    console.error("Signup error:", error);
    alert(error.message);
  }
}

async function onLogin(e){
  e.preventDefault();

  const fd = new FormData(e.target);
  const email = (fd.get("email") || "").trim().toLowerCase();
  const password = fd.get("password");

  try {
    await signInWithEmailAndPassword(auth, email, password);
e.target.reset();
  } catch (error){
    console.error("Login error:", error);
    alert("Invalid email or password.");
  }
}

async function onForgotPassword(e){
  e.preventDefault();

  const fd = new FormData(e.target);
  const email = (fd.get("email") || "").trim().toLowerCase();

  if (!email){
    alert("Please enter your email.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent.");
    $("#forgotDialog")?.close();
  } catch (error){
    console.error("Password reset error:", error);
    alert(error.message);
  }
}

async function logout(){
  try {
    clearDemoInterestTimer();

    // Real Firebase user logout
    if (auth.currentUser){
      await signOut(auth);
    }

    // Demo user logout
    STATE.me = null;
    localStorage.removeItem("ns-current-user-id");

    closeSideMenu();
    closeMusicDock();

    const bottomNav = $("#bottomNav");
    if (bottomNav) bottomNav.classList.add("hidden");

    applyUserToUI();

    // Send user back to Sign Up / Log In page
    goto("login");
  } catch (error){
    console.error("Logout error:", error);
    alert(error.message || "Logout failed. Please try again.");
  }
}


function demoLogin(){
  let users = getUsers();
  let user = users.find(u => u.email === "demo@nsaaidemo.local");
  if (!user){
user = {
  id:"demo",
  uid:"demo",
  name:"Demo Innovator",
  email:"demo@nsaaidemo.local",
  password:"demo",
  school:"NSAAI Demo Campus",
  location:"Miami, FL",
  skills:["Product","AI","Design"],
  link:"",
  bio:"",
  photoURL:"",
  membershipStatus:"demo"
};
    users.push(user);
    saveUsers(users);
  }

  STATE.me = user;
  store.set("ns-current-user-id", user.id);
 applyUserToUI();
goto("dashboard");
subnav("home");
buildBottomNav("home");

  demoInterestHasShownThisSession = false;
  sessionStorage.removeItem(DEMO_POPUP_DISMISSED_KEY);
  scheduleDemoInterestPopup();
}

function applyUserToUI(){
    const notifBtn = $("#notifBtn");
  const notifPanel = $("#notifPanel");

  if (!STATE.me){
    if (notifBtn) notifBtn.classList.add("hidden");
    if (notifPanel) closeNotifPanel();
    return;
  }

  if (notifBtn) notifBtn.classList.remove("hidden");
  ensureNotificationsSeeded();
  renderNotifications();
refreshRealNetworkData();
  $("#meName").textContent = STATE.me.name || "Member";
  $("#meSchool").textContent = STATE.me.school || "";
  $("#meInitial").textContent = initialBadge(STATE.me.name || "NSAAI");
  // hydrate profile form
  const form = $("#profileForm");
  if (form){
    form.elements.name.value = STATE.me.name || "";
   form.elements.school.value = STATE.me.school || "";
if (form.elements.location) form.elements.location.value = STATE.me.location || "";
form.elements.skills.value = (STATE.me.skills || []).join(", ");
    form.elements.link.value = STATE.me.link || "";
    form.elements.bio.value = STATE.me.bio || "";
  }
  // ✅ avatar (saved per user)
// ✅ avatar from Firebase profile
setAvatarPreview(STATE.me?.photoURL || "");
  syncSideProfile();
  syncCommunityComposerAvatar();
  renderStories();
  renderStudio();
}

/* Profile save + avatar */
async function onAvatarChange(e){
  const file = e.target.files?.[0];
  if (!file || !STATE.me) return;

  if (!file.type || !file.type.startsWith("image/")){
    alert("Please choose an image file.");
    e.target.value = "";
    return;
  }

  try {
    await openAvatarCropDialogFromFile(file);
  } catch (err){
    console.error("Avatar upload failed:", err);
    alert("That image could not be loaded. Please try a different photo.");
    e.target.value = "";
  }
}
 
async function onSaveProfile(e){
  e.preventDefault();

  if (!STATE.me || !auth.currentUser){
    alert("Please log in first.");
    return;
  }

  const fd = new FormData(e.target);

  const updatedProfile = {
    name: (fd.get("name") || "").trim(),
    school: (fd.get("school") || "").trim(),
    location: (fd.get("location") || "").trim(),
    skills: (fd.get("skills") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    link: (fd.get("link") || "").trim(),
    bio: (fd.get("bio") || "").trim(),
    updatedAt: serverTimestamp()
  };

  const croppedAvatarData = (fd.get("croppedAvatarData") || "").trim();

  if (croppedAvatarData){
    const avatarRef = ref(storage, `users/${auth.currentUser.uid}/profile/avatar.png`);

    await uploadString(avatarRef, croppedAvatarData, "data_url");

    const photoURL = await getDownloadURL(avatarRef);

    updatedProfile.photoURL = photoURL;
    setAvatarPreview(photoURL);
  }

  await updateDoc(doc(db, "users", auth.currentUser.uid), updatedProfile);

  STATE.me = {
    ...STATE.me,
    ...updatedProfile,
    photoURL: updatedProfile.photoURL || STATE.me.photoURL || ""
  };

  const hiddenCropped = $("#croppedAvatarData");
  if (hiddenCropped) hiddenCropped.value = "";

  applyUserToUI();
  alert("Profile saved.");
}


/* =======================================================
   REAL USERS + MUTUAL CONNECTION SYSTEM
======================================================= */

function connectionDocId(uidA, uidB){
  return [uidA, uidB].sort().join("_");
}

function normalizeUserForNetwork(user){
  return {
    id: user.uid || user.id || "",
    uid: user.uid || user.id || "",
    name: user.name || "NSAAI Member",
    email: user.email || "",
    school: user.school || "",
    role: user.membershipStatus === "member" ? "Member" : "Innovator",
    skills: Array.isArray(user.skills) ? user.skills : [],
    affinity: "NSAAI Member",
    bio: user.bio || "NSAAI innovator building, connecting, and growing with the community.",
    city: user.location || "",
    location: user.location || "",
    avatarUrl: user.photoURL || "",
    isRealUser: true
  };
}

async function loadRealUsers(){
  if (!auth.currentUser) return;

  try {
    const snap = await getDocs(collection(db, "users"));

    REAL_USERS = snap.docs
      .map(docSnap => normalizeUserForNetwork({ id: docSnap.id, ...docSnap.data() }))
      .filter(u => u.uid && u.uid !== auth.currentUser.uid);

  } catch (error){
    console.error("Load real users error:", error);
    REAL_USERS = [];
  }
}

async function loadConnectionState(){
  if (!auth.currentUser) return;

  try {
    const snap = await getDocs(collection(db, "connections"));

    CONNECTION_STATE = snap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(c =>
        c.requesterId === auth.currentUser.uid ||
        c.receiverId === auth.currentUser.uid
      );

  } catch (error){
    console.error("Load connections error:", error);
    CONNECTION_STATE = [];
  }
}

function getConnectionWithUser(otherUid){
  if (!auth.currentUser || !otherUid) return null;

  return CONNECTION_STATE.find(c =>
    (c.requesterId === auth.currentUser.uid && c.receiverId === otherUid) ||
    (c.requesterId === otherUid && c.receiverId === auth.currentUser.uid)
  ) || null;
}

function getConnectionButtonState(person){
  if (!person?.isRealUser) {
    const conns = getConnections();
    const isConn = conns.some(c => c.id === person.id);
    return {
      label: isConn ? "Connected" : "Connect",
      className: isConn ? "connected" : "",
      disabled: isConn
    };
  }

  const conn = getConnectionWithUser(person.uid);

  if (!conn){
    return {
      label: "Connect",
      className: "",
      disabled: false
    };
  }

  if (conn.status === "connected"){
    return {
      label: "Connected",
      className: "connected",
      disabled: true
    };
  }

  if (conn.status === "pending" && conn.requesterId === auth.currentUser.uid){
    return {
      label: "Pending",
      className: "pending",
      disabled: true
    };
  }

  if (conn.status === "pending" && conn.receiverId === auth.currentUser.uid){
    return {
      label: "Connect Back",
      className: "incoming",
      disabled: false
    };
  }

  return {
    label: "Connect",
    className: "",
    disabled: false
  };
}

async function handleRealUserConnect(person){
  if (!auth.currentUser || !STATE.me){
    alert("Please sign up or log in to connect.");
    return;
  }

  if (!person?.isRealUser || !person.uid){
    addConnectionPerson({ id: person.id, name: person.name });
    return;
  }

  const connId = connectionDocId(auth.currentUser.uid, person.uid);
  const existing = getConnectionWithUser(person.uid);

  try {
    if (!existing){
      await setDoc(doc(db, "connections", connId), {
        id: connId,
        requesterId: auth.currentUser.uid,
        requesterName: STATE.me.name || "NSAAI Member",
        receiverId: person.uid,
        receiverName: person.name || "NSAAI Member",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addLocalConnectionNotification({
        title: "Connection request sent",
        text: `Your request to connect with ${person.name} is pending until they connect back.`,
        icon: "🤝"
      });
    } else if (existing.status === "pending" && existing.receiverId === auth.currentUser.uid){
      await updateDoc(doc(db, "connections", existing.id), {
        status: "connected",
        updatedAt: serverTimestamp(),
        acceptedAt: serverTimestamp()
      });

      addLocalConnectionNotification({
        title: "New connection confirmed",
        text: `You and ${person.name} are now officially connected.`,
        icon: "✅"
      });
    }

    await loadConnectionState();
    renderFriends();
    renderNotifications();

  } catch (error){
    console.error("Connect error:", error);
    alert(error.message);
  }
}

function addLocalConnectionNotification({ title, text, icon = "🤝" }){
  const notifications = getNotifications();

  notifications.unshift({
    id: "conn-" + Date.now(),
    icon,
    title,
    text,
    time: "Just now",
    unread: true,
    type: "connection"
  });

  saveNotifications(notifications);
}

function syncConnectionNotificationsFromState(){
  if (!STATE.me || !auth.currentUser) return;

  const notifications = getNotifications();
  let changed = false;

  CONNECTION_STATE.forEach(conn => {
    const isIncomingPending =
      conn.status === "pending" &&
      conn.receiverId === auth.currentUser.uid;

    const isConnected =
      conn.status === "connected" &&
      (conn.requesterId === auth.currentUser.uid || conn.receiverId === auth.currentUser.uid);

    const otherName =
      conn.requesterId === auth.currentUser.uid
        ? conn.receiverName
        : conn.requesterName;

    const notifId = isIncomingPending
      ? `incoming-${conn.id}`
      : isConnected
        ? `connected-${conn.id}`
        : "";

    if (!notifId) return;

    const alreadyExists = notifications.some(n => n.id === notifId);
    if (alreadyExists) return;

    if (isIncomingPending){
      notifications.unshift({
        id: notifId,
        icon: "🤝",
        title: "New connection request",
        text: `${otherName || "Someone"} wants to connect with you. Connect back to make it official.`,
        time: "New",
        unread: true,
        type: "connection"
      });
      changed = true;
    }

    if (isConnected){
      notifications.unshift({
        id: notifId,
        icon: "✅",
        title: "Connection confirmed",
        text: `You and ${otherName || "another NSAAI member"} are now officially connected.`,
        time: "New",
        unread: true,
        type: "connection"
      });
      changed = true;
    }
  });

  if (changed){
    saveNotifications(notifications);
  }
}

async function refreshRealNetworkData(){
  if (!auth.currentUser) return;

  await loadRealUsers();
  await loadConnectionState();
  syncConnectionNotificationsFromState();
  renderNotifications();

  const friendsPageOpen = $("#sub-friends")?.classList.contains("active");
  const feedPageOpen = $("#sub-feed")?.classList.contains("active");

  if (friendsPageOpen) renderFriends();
  if (feedPageOpen) renderFeed();
}

function getConnectedRealUserIds(){
  if (!auth.currentUser) return [];

  return CONNECTION_STATE
    .filter(c => c.status === "connected")
    .map(c => c.requesterId === auth.currentUser.uid ? c.receiverId : c.requesterId);
}

/* =======================================================
   Directory / Friends
======================================================= */
function connectionsKey(){
  return STATE.me ? `ns-connections-${STATE.me.id}` : "ns-connections-demo";
}
function getConnections(){
  return store.get(connectionsKey(), []);
}
function saveConnections(arr){
  store.set(connectionsKey(), arr);
}

function renderFriends(){
  const list = $("#friendList");
  if (!list) return;

  const term = ($("#friendSearch").value || "").toLowerCase();

  const realPeople = REAL_USERS.map(u => ({
    ...u,
    sourcePriority: 1
  }));

  const demoPeople = PEOPLE.map(p => ({
    ...p,
    isRealUser: false,
    uid: "",
    sourcePriority: 0
  }));

  let people = [...realPeople, ...demoPeople];

  if (STATE.recsMode && STATE.me){
    const mySchool = (STATE.me.school || "").toLowerCase();
    const mySkills = (STATE.me.skills || []).map(s => s.toLowerCase());

    people.sort((a,b) => {
      const aScore =
        (a.sourcePriority * 100) +
        ((a.school || "").toLowerCase() === mySchool ? 2 : 0) +
        ((a.skills || []).some(s => mySkills.includes(String(s).toLowerCase())) ? 1 : 0);

      const bScore =
        (b.sourcePriority * 100) +
        ((b.school || "").toLowerCase() === mySchool ? 2 : 0) +
        ((b.skills || []).some(s => mySkills.includes(String(s).toLowerCase())) ? 1 : 0);

      return bScore - aScore;
    });

    people = people.slice(0, 80);
  } else {
    people.sort((a,b) => b.sourcePriority - a.sourcePriority);
  }

  if (term){
    people = people.filter(p =>
      (p.name || "").toLowerCase().includes(term) ||
      (p.school || "").toLowerCase().includes(term) ||
      (p.location || p.city || "").toLowerCase().includes(term) ||
      (p.skills || []).join(" ").toLowerCase().includes(term) ||
      (p.affinity || "").toLowerCase().includes(term)
    );
  }

  list.innerHTML = people.map(p => {
    const btnState = getConnectionButtonState(p);

    return `
      <li class="item ${p.isRealUser ? "real-user-card" : "demo-user-card"}" data-id="${sanitize(p.id)}" data-uid="${sanitize(p.uid || "")}" data-real="${p.isRealUser ? "1" : "0"}">
        <div class="row dir-row">
          <div class="row grow">
            <span class="avatar">
              ${
                p.avatarUrl
                  ? `<img src="${sanitize(p.avatarUrl)}" alt="${sanitize(p.name)}" loading="lazy" />`
                  : sanitize(initialBadge(p.name))
              }
            </span>

            <div>
              <strong>${sanitize(p.name)}</strong>
              ${p.isRealUser ? `<span class="real-user-tag">Real User</span>` : ""}
              <div class="small muted">${sanitize(p.school || "NSAAI")} • ${sanitize(p.role || "Innovator")}</div>
              <div class="small muted">${sanitize((p.skills || []).join(", "))}</div>
              <div class="small muted">${sanitize(p.affinity || "")}</div>
              ${p.location || p.city ? `<div class="small muted">📍 ${sanitize(p.location || p.city)}</div>` : ""}
            </div>
          </div>

          <div class="dir-actions">
            <button class="btn small" data-action="profile">Profile</button>
            <button class="btn small btn-outline connect-btn ${btnState.className}" data-action="connect" ${btnState.disabled ? "disabled" : ""}>
              ${sanitize(btnState.label)}
            </button>
            <button class="btn small" data-action="message">Message</button>
          </div>
        </div>
      </li>
    `;
  }).join("") || `<li class="item muted small">No members found yet.</li>`;
}

function openFriendProfile(p){
  const dlg = $("#friendProfileDialog");
  if (!dlg) return;
  $("#fpName").textContent = p.name;
  $("#fpSchool").textContent = p.school;
  $("#fpSkills").textContent = `Skills: ${p.skills.join(", ")}`;
  $("#fpAffinity").textContent = `Affinity: ${p.affinity}`;
  $("#fpBio").textContent = p.bio;
  const av = $("#fpAvatar");
if (av){
  if (p.avatarUrl){
    av.innerHTML = `<img src="${sanitize(p.avatarUrl)}" alt="${sanitize(p.name)}" loading="lazy" />`;
  } else {
    av.textContent = initialBadge(p.name);
  }
}

  dlg.dataset.friendId = p.id;
  dlg.dataset.friendName = p.name;
dlg.dataset.friendUid = p.uid || "";
dlg.dataset.friendReal = p.isRealUser ? "1" : "0";

const connectBtn = $("#fpConnect");
if (connectBtn){
  const btnState = getConnectionButtonState(p);
  connectBtn.textContent = btnState.label;
  connectBtn.disabled = btnState.disabled;
  connectBtn.classList.remove("pending", "incoming", "connected");
  if (btnState.className) connectBtn.classList.add(btnState.className);
}
  dlg.showModal();
}

/* Generic helpers so both directory + profile dialog share logic */
function addConnectionPerson(person){
  const list = getConnections();

  if (!list.some(c => c.id === person.id)){
    list.push({
      id: person.id,
      name: person.name,
      added: new Date().toISOString()
    });

    saveConnections(list);
    STATE.metrics.connections++;

    addLocalConnectionNotification({
      title: "Demo connection added",
      text: `You connected with ${person.name}. Real users will require mutual connection approval.`,
      icon: "🤝"
    });

    renderFriends();
    renderConnectionsList();
    renderNotifications();

    alert("Demo connection added.");
  } else {
    alert("You’re already connected.");
  }
}

function sendMessageToPerson(person){
  const text = prompt(`Send a message to ${person.name}:`);
  if (!text) return;
  addMessage(person.id, person.name, text, "outgoing");
  alert("Message sent.");
}

async function onConnectFromProfile(){
  const dlg = $("#friendProfileDialog");
  const friendId = dlg.dataset.friendId;
  const friendUid = dlg.dataset.friendUid;
  const isReal = dlg.dataset.friendReal === "1";

  if (!friendId && !friendUid) return;

  const person = isReal
    ? REAL_USERS.find(p => p.uid === friendUid)
    : PEOPLE.find(p => p.id === friendId);

  if (!person) return;

  await handleRealUserConnect(person);

  $("#friendProfileDialog")?.close();
}

function onMessageFromProfile(){
  const dlg = $("#friendProfileDialog");
  const friendId = dlg.dataset.friendId;
  const friendName = dlg.dataset.friendName;
  if (!friendId) return;
  sendMessageToPerson({ id:friendId, name:friendName });
}

function renderConnectionsList(){
  const ul = $("#connectionsList");
  if (!ul) return;

  const realConnectedIds = getConnectedRealUserIds();

  const realConnections = REAL_USERS
    .filter(u => realConnectedIds.includes(u.uid))
    .map(u => ({
      id: u.uid,
      name: u.name,
      added: new Date().toISOString(),
      avatarUrl: u.avatarUrl,
      school: u.school,
      isRealUser: true
    }));

  const demoConnections = getConnections().map(c => {
    const person = PEOPLE.find(p => p.id === c.id);
    return {
      ...c,
      avatarUrl: person?.avatarUrl || "",
      school: person?.school || "",
      isRealUser: false
    };
  });

  const conns = [...realConnections, ...demoConnections];

  ul.innerHTML = conns.map(c => `
    <li class="item ${c.isRealUser ? "real-user-card" : "demo-user-card"}">
      <div class="row">
        <span class="avatar">
          ${
            c.avatarUrl
              ? `<img src="${sanitize(c.avatarUrl)}" alt="${sanitize(c.name)}" loading="lazy" />`
              : sanitize(initialBadge(c.name))
          }
        </span>

        <div class="grow">
          <strong>${sanitize(c.name)}</strong>
          ${c.isRealUser ? `<span class="real-user-tag">Real User</span>` : ""}
          <div class="small muted">${c.isRealUser ? "Official mutual connection" : "Demo connection"}</div>
          ${c.school ? `<div class="small muted">${sanitize(c.school)}</div>` : ""}
        </div>
      </div>
    </li>
  `).join("") || `<li class="item small muted">No official connections yet. Connect with a real user, then they must connect back.</li>`;
}

function openConnectionsDialog(){
  renderConnectionsList();
  $("#connectionsDialog").showModal();
}

function renderMessagesList(){
  const wrap = $("#messagesList");
  if (!wrap) return;
  const msgs = getMessages();
  if (!msgs.length){
    wrap.innerHTML = `<div class="item small muted">No messages yet. Start one from a member’s profile.</div>`;
    return;
  }
  wrap.innerHTML = msgs.map(m => `
    <div class="item">
      <div class="small muted">
        ${m.dir === "outgoing" ? "You →" : "From"} ${sanitize(m.friendName)} •
        ${new Date(m.ts).toLocaleString()}
      </div>
      <p>${sanitize(m.text)}</p>
    </div>
  `).join("");
}

function openMessagesDialog(){
  renderMessagesList();
  $("#messagesDialog").showModal();
}

/* =======================================================
   Community Stories (NEW)
======================================================= */
function storiesKey(){
  return STATE.me ? `ns-stories-${STATE.me.id}` : "ns-stories-demo";
}

function getSeedStories(){
  const now = Date.now();

  const storyPeople = (PEOPLE || []).slice(0, 10);

  if (storyPeople.length){
    return storyPeople.map((p, i) => ({
      id: "st-seed-" + (i + 1),
      user: p.name,
      avatar: p.avatarUrl || getCommunityAvatarFromName(p.name),
      caption: [
        "Locked in and building.",
        "Prototype progress today 🚀",
        "Big ideas loading.",
        "Community first, always.",
        "Back on the grind.",
        "Making something meaningful.",
        "Late-night innovation session.",
        "New opportunity coming soon.",
        "Sharing the journey.",
        "Creating with purpose."
      ][i % 10],
      createdAt: now - ((i + 1) * 90 * 60 * 1000)
    }));
  }

  // fallback if PEOPLE is empty for any reason
  const fallbackNames = [
    "Jordan Miles",
    "Amara Cole",
    "Malik Johnson",
    "Nia Brooks",
    "Evan Ross",
    "Zora Fields"
  ];

  return fallbackNames.map((name, i) => ({
    id: "st-fallback-" + (i + 1),
    user: name,
    avatar: getCommunityAvatarFromName(name),
    caption: "Building something meaningful.",
    createdAt: now - ((i + 1) * 90 * 60 * 1000)
  }));
}

function getStories(){
  let arr = store.get(storiesKey(), null);
  if (!Array.isArray(arr) || !arr.length){
    arr = getSeedStories();
    store.set(storiesKey(), arr);
  }

  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  arr = arr.filter(s => Number(s.createdAt) >= cutoff);
  store.set(storiesKey(), arr);
  return arr;
}

function saveStories(arr){
  store.set(storiesKey(), arr);
}

function getMyCommunityAvatar(){
  return STATE.me?.photoURL || "";
}

function storyInitial(name=""){
  return initialBadge(name || "You");
}

function timeAgoShort(ts){
  const diff = Math.max(0, Date.now() - Number(ts || Date.now()));
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins || 1}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return "24h";
}

function renderStories(){
  const rail = $("#storiesRail");
  if (!rail) return;

  const stories = getStories();
  const myAvatar = getMyCommunityAvatar();

  const connectedRealUserIds = getConnectedRealUserIds();
  const connectedRealUsers = REAL_USERS.filter(u => connectedRealUserIds.includes(u.uid));

  const addCard = `
    <button id="addStoryCard" class="story-card add-story-card" type="button" aria-label="Add a story">
      <div class="story-ring add-story-ring">
        <div class="story-avatar add-story-avatar">
          ${
            myAvatar
              ? `<img src="${sanitize(myAvatar)}" alt="Your profile photo" />`
              : sanitize(initialBadge(STATE.me?.name || "You"))
          }
        </div>
      </div>
      <div class="story-name">Your Story</div>
    </button>
  `;

  const realUserCards = connectedRealUsers.map(u => `
    <button class="story-card live-story real-user-story" type="button" data-real-user-story="${sanitize(u.uid)}" title="${sanitize(u.name)}">
      <div class="story-ring">
        <div class="story-avatar">
          ${
            u.avatarUrl
              ? `<img src="${sanitize(u.avatarUrl)}" alt="${sanitize(u.name)} story" />`
              : sanitize(initialBadge(u.name))
          }
        </div>
      </div>
      <div class="story-name">${sanitize((u.name || "User").split(" ")[0])}</div>
    </button>
  `).join("");

  const demoCards = stories.map(s => {
    const avatarSrc = s.avatar || getCommunityAvatarFromName(s.user);

    return `
      <button class="story-card live-story" type="button" data-story-id="${sanitize(s.id)}" title="${sanitize(s.caption || "")}">
        <div class="story-ring">
          <div class="story-avatar">
            <img src="${sanitize(avatarSrc)}" alt="${sanitize(s.user)} story" />
          </div>
        </div>
        <div class="story-name">${sanitize((s.user || "").split(" ")[0] || s.user || "Story")}</div>
      </button>
    `;
  }).join("");

  rail.innerHTML = addCard + realUserCards + demoCards;
}

function openStoryDialog(){
  const dlg = $("#storyDialog");
  if (!dlg) return;
  dlg.showModal();
}

function closeStoryDialog(){
  const dlg = $("#storyDialog");
  if (!dlg) return;
  dlg.close();
}

function openStoryView(story){
  const dlg = $("#storyViewDialog");
  const userEl = $("#storyViewUser");
  const mediaEl = $("#storyViewMedia");
  const captionEl = $("#storyViewCaption");
  const timeEl = $("#storyViewTime");

  if (!dlg || !story) return;

  if (userEl) userEl.textContent = `${story.user || "Story"}'s Story`;
  if (captionEl) captionEl.textContent = story.caption || "";
  if (timeEl) timeEl.textContent = timeAgoShort(story.createdAt);

  if (mediaEl){
    if (story.media?.type?.startsWith("video")){
      mediaEl.innerHTML = `
        <video controls playsinline style="width:100%;border-radius:16px;max-height:420px;object-fit:cover">
          <source src="${sanitize(story.media.url)}" />
        </video>
      `;
    } else if (story.media?.url){
      mediaEl.innerHTML = `
        <img src="${sanitize(story.media.url)}" alt="Story media" style="width:100%;border-radius:16px;max-height:420px;object-fit:cover" />
      `;
    } else {
      mediaEl.innerHTML = `
        <div style="min-height:220px;border-radius:16px;display:grid;place-items:center;background:var(--surface-3);border:1px solid var(--border);font-size:42px">
          ⚡
        </div>
      `;
    }
  }

  dlg.showModal();
}

async function onSubmitStory(e){
  e.preventDefault();
  if (!STATE.me){
    alert("Please log in to post a story.");
    return;
  }

  const captionEl = $("#storyCaption");
  const mediaEl = $("#storyMedia");

  const caption = (captionEl?.value || "").trim();
  const file = mediaEl?.files?.[0];

   let avatar = getMyCommunityAvatar() || getCommunityAvatarFromName(STATE.me?.name || "You");

  if (file){
    avatar = await dataURL(file);
  }

  const story = {
    id: "st-" + Date.now(),
    user: STATE.me.name || "You",
    avatar: avatar || "",
    caption: caption || "New story",
    createdAt: Date.now()
  };

  const stories = getStories();
  stories.unshift(story);
  saveStories(stories);

  if (captionEl) captionEl.value = "";
  if (mediaEl) mediaEl.value = "";

  closeStoryDialog();
  renderStories();
}

function onStoryCardClick(e){
  const addCard = e.target.closest("#addStoryCard");
  if (addCard){
    e.preventDefault();
    e.stopPropagation();
    openStoryDialog();
    return;
  }

  const card = e.target.closest(".story-card.live-story");
  if (!card) return;

  e.preventDefault();
  e.stopPropagation();

  const storyId = card.dataset.storyId;
  const stories = getStories();
  const story = stories.find(s => s.id === storyId);

  if (!story) return;

  openStoryView(story);
}

function scrollStories(direction){
  const rail = $("#storiesRail");
  if (!rail) return;
  const amount = Math.round(rail.clientWidth * 0.75);
  rail.scrollBy({
    left: direction === "left" ? -amount : amount,
    behavior: "smooth"
  });
}

function focusCommunityComposer(){
  const text = $("#postText");
  if (!text) return;
  text.focus();
  text.scrollIntoView({ behavior:"smooth", block:"center" });
}

function syncCommunityComposerAvatar(){
  const avatarEl = $("#communityComposerAvatar");
  if (!avatarEl) return;

  const src = getMyCommunityAvatar();
  if (src){
    avatarEl.innerHTML = `<img src="${sanitize(src)}" alt="Your profile photo" />`;
  } else if (STATE.me){
    avatarEl.textContent = initialBadge(STATE.me.name || "You");
  } else {
    avatarEl.textContent = "👤";
  }
}



/* =======================================================
   Feed / Community
======================================================= */
function renderFeed(){
  const ul = $("#feedList");
  if (!ul) return;

  renderStories();
  syncCommunityComposerAvatar();

  const filter = $("#feedFilter")?.value || "all";
  const sort = $("#feedSort")?.value || "latest";

  const connectedRealUserIds = getConnectedRealUserIds();

let posts = [...FEED_STATE].map(p => ({
  ...p,
  isRealUserPost:
    !!p.uid &&
    (
      p.uid === auth.currentUser?.uid ||
      connectedRealUserIds.includes(p.uid)
    )
}));

  if (filter !== "all"){
    posts = posts.filter(p => p.audience === filter);
  }
  
  if (filter === "area"){
  const myArea = (STATE.me?.location || "").toLowerCase().trim();

  posts = posts.filter(p => {
    const postArea = (p.location || "").toLowerCase().trim();
    return myArea && postArea && (postArea.includes(myArea) || myArea.includes(postArea));
  });
}

  if (sort === "popular"){
    posts.sort((a,b) => {
      const aScore = (a.likes || 0) + ((a.comments || []).length * 2);
      const bScore = (b.likes || 0) + ((b.comments || []).length * 2);
      return bScore - aScore;
    });
  } else {
posts.sort((a,b) => {
  const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;

  if (a.isRealUserPost !== b.isRealUserPost) return a.isRealUserPost ? -1 : 1;
if (aTime || bTime) return bTime - aTime;

  const aId = Number(String(a.id || "").replace(/\D/g,"")) || 0;
  const bId = Number(String(b.id || "").replace(/\D/g,"")) || 0;
  return bId - aId;
});
  }

  ul.innerHTML = posts.map(p => {
    const liked = p.likedByMe ? "liked" : "";
    const likeLabel = p.likedByMe ? "Liked" : "Like";
        const authorNameOnly = String(p.author || "").split(" (")[0].trim();
       const authorAvatar = p.authorAvatar || getCommunityAvatarFromName(authorNameOnly);

    const media = p.media ? `
      <div class="post-media">
        ${p.media.type === "image"
          ? `<img src="${sanitize(p.media.url)}" alt="Attached media" />`
          : `<video src="${sanitize(p.media.url)}" controls></video>`}
      </div>` : "";

    const link = p.link
      ? `<a class="post-link" href="${sanitize(p.link)}" target="_blank" rel="noreferrer">🔗 ${sanitize(p.link)}</a>`
      : "";

    const comments = (p.comments || []).map(c => `
      <div class="small muted">💬 <strong>${sanitize(c.by)}:</strong> ${sanitize(c.text)}</div>
    `).join("");

    return `
      <li class="post ${p.isRealUserPost ? "real-user-post" : ""}" data-id="${p.id}">
        <div class="meta">
          <div class="row" style="gap:12px;align-items:flex-start;flex-wrap:nowrap">
                               <span class="avatar">
              <img src="${sanitize(authorAvatar)}" alt="${sanitize(authorNameOnly)}" loading="lazy" />
            </span>
            <div>
              <strong>${sanitize(p.author)}</strong>
              <div class="small muted" style="margin-top:4px">
                ${p.isRealUserPost ? "Real NSAAI User" : "Demo Community"} • ${p.audience === "campus" ? "Campus" : p.audience === "area" ? "Area" : "Everyone"}
              </div>
              <div style="margin-top:6px">
                <span class="tag audience">${p.audience === "campus" ? "Campus" : "All"}</span>
              </div>
            </div>
          </div>

          <div class="small muted">
            ${(p.likes || 0)} like${(p.likes || 0) === 1 ? "" : "s"}
          </div>
        </div>

        <p>${sanitize(p.text)}</p>
        ${media}
        ${link}

        <div class="row actions">
          <button class="${liked}" data-action="like">❤️ ${likeLabel}</button>
          <button data-action="comment">💬 Comment</button>
          <button data-action="repost">🔁 Repost</button>
        </div>

        <div class="comment-area small muted">${comments}</div>
      </li>
    `;
  }).join("") || `<li class="post muted small">No posts yet. Share something to get the community going.</li>`;
}

async function onPost(e){
  e.preventDefault();

  if (!STATE.me || !auth.currentUser){
    alert("Please sign up or log in to post.");
    return;
  }

  const textEl = $("#postText");
  const linkEl = $("#postLink");
  const mediaEl = $("#postMedia");
  const audEl  = $("#postAudience");

  const text = (textEl?.value || "").trim();
  const link = (linkEl?.value || "").trim();

  if (!text){
    alert("Write something first.");
    return;
  }

  try {
    const postData = {
      uid: auth.currentUser.uid,
      author: `${STATE.me.name || "You"} (${STATE.me.school || "NSAAI"})`,
      authorName: STATE.me.name || "You",
      authorSchool: STATE.me.school || "",
      authorAvatar: STATE.me.photoURL || "",
      audience: audEl?.value || "all",
      location: STATE.me.location || "",
      text,
      link: link || "",
      likes: 0,
      comments: [],
isRealUserPost: true,
      createdAt: serverTimestamp()
    };

    const file = mediaEl?.files?.[0];

    if (file){
      const safeFileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const mediaRef = ref(storage, `posts/${auth.currentUser.uid}/${safeFileName}`);

      await uploadBytes(mediaRef, file);

      const mediaURL = await getDownloadURL(mediaRef);
      const type = file.type.startsWith("video") ? "video" : "image";

      postData.media = {
        type,
        url: mediaURL
      };
    }

    await addDoc(collection(db, "posts"), postData);

    if (textEl) textEl.value = "";
    if (linkEl) linkEl.value = "";
    if (mediaEl) mediaEl.value = "";

    STATE.metrics.posts++;

    await loadFirebasePosts();
    focusCommunityComposer();

  } catch (error){
    console.error("Post error:", error);
    alert(error.message);
  }
}

async function loadFirebasePosts(){
  try {
    const postsQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(postsQuery);

    const firebasePosts = snap.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        ...data,
        comments: data.comments || [],
        likes: data.likes || 0
      };
    });

FEED_STATE = firebasePosts.length
  ? [...firebasePosts, ...seedPosts.map(p => ({ ...p, isDemoPost: true }))]
  : seedPosts.map(p => ({ ...p, isDemoPost: true }));

    renderFeed();

  } catch (error){
    console.error("Load posts error:", error);

    if (!FEED_STATE.length){
      FEED_STATE = seedPosts.map(p => ({ ...p }));
    }

    renderFeed();
  }
}

function onFeedAction(e){
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const li = e.target.closest(".post");
  if (!li) return;
  const id = li.dataset.id;
  const post = FEED_STATE.find(p => p.id === id);
  if (!post) return;

  const action = btn.dataset.action;
  if (action === "like"){
    post.likedByMe = !post.likedByMe;
    post.likes = clamp((post.likes || 0) + (post.likedByMe ? 1 : -1), 0, 9999);
    if (post.likedByMe) STATE.metrics.likes++;
    renderFeed();
  } else if (action === "comment"){
    const text = prompt("Add a quick comment:");
    if (!text) return;
    post.comments = post.comments || [];
    post.comments.push({ by: STATE.me?.name || "Guest", text });
    renderFeed();
  } else if (action === "repost"){
    const copy = {
      ...post,
      id: "p-" + Date.now(),
      author: STATE.me ? `${STATE.me.name} (repost)` : "You (repost)",
      text: `Reposting this because it stood out:\n\n${post.text || ""}`
    };
    FEED_STATE.unshift(copy);
    STATE.metrics.posts++;
    renderFeed();
    alert("Reposted to the Community feed.");
  }
}

/* =======================================================
   Calendar / Events (RSVP + Check-in buttons on right)
======================================================= */
function renderEvents(){
  const ul = $("#eventList");
  if (!ul) return;

  const formatter = new Intl.DateTimeFormat(undefined, {
    month:"numeric",
    day:"numeric",
    year:"numeric",
    hour:"numeric",
    minute:"2-digit"
  });

  const visibleEvents = getVisibleCalendarEvents();

  ul.innerHTML = visibleEvents.map(ev => {
    const dt = new Date(ev.datetime);
    const visibilityLabel = ev.visibility === "private" ? "🔒 Private" : "🌎 Public";

    return `
      <li class="item" data-id="${ev.id}">
        <div class="row event-top">
          <div class="grow">
            <strong>${sanitize(ev.title)}</strong>
            <div class="small muted">${formatter.format(dt)} • ${sanitize(ev.location)} • Host: ${sanitize(ev.host)}</div>
            <div class="small muted">${visibilityLabel}</div>
            <p class="small muted" style="margin-top:4px">${sanitize(ev.desc)}</p>
          </div>
          <div class="event-actions">
            <button class="btn small btn-primary" data-action="rsvp">RSVP</button>
            <button class="btn small" data-action="checkin">Check in</button>
          </div>
        </div>
        <div class="row small muted" style="margin-top:6px">
          <span>RSVPs: ${ev.rsvps || 0}</span>
          <span>Check-ins: ${ev.checkins || 0}</span>
        </div>
      </li>
    `;
  }).join("") || `<li class="item small muted">No events yet. Tap + New to add your first one.</li>`;

  updateCalendarSummary();
}

function onCreateEvent(e){
  e.preventDefault();

  const fd = new FormData(e.target);
  const visibility = fd.get("visibility") || "private";

  const ev = {
    id: "e-" + Date.now(),
    title: (fd.get("title") || "").trim(),
    datetime: fd.get("datetime"),
    location: (fd.get("location") || "").trim(),
    host: (fd.get("host") || "").trim(),
    desc: (fd.get("desc") || "").trim(),
    visibility,
    creatorId: getCurrentCalendarUserId(),
    creatorName: getCurrentCalendarUserName(),
    rsvps: 0,
    checkins: 0
  };

  EVENTS_STATE.unshift(ev);

  const newDate = new Date(ev.datetime);
  STATE.calendarSelectedDate = newDate;
  STATE.calendarViewDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);

  renderEvents();
  renderVisualCalendar();
  updateCalendarSummary();

  const dialog = $("#eventDialog");
  if (dialog) dialog.close();

  e.target.reset();
  resetEventVisibilityToggle();
}
function onEventAction(e){
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const li = e.target.closest(".item");
  if (!li) return;
  const id = li.dataset.id;
  const ev = EVENTS_STATE.find(ev => ev.id === id);
  if (!ev) return;
  const action = btn.dataset.action;
  if (action === "rsvp"){
    ev.rsvps = (ev.rsvps || 0) + 1;
    STATE.metrics.rsvps++;
    renderEvents();
  } else if (action === "checkin"){
    ev.checkins = (ev.checkins || 0) + 1;
    STATE.metrics.checkins++;
    renderEvents();
  }
}

function updateCalendarSummary(){
  const monthCountEl = $("#calendarMonthCount");
  const nextUpEl = $("#calendarNextUp");
  const visibleEvents = getVisibleCalendarEvents();

  if (monthCountEl){
    const viewDate = STATE.calendarViewDate || new Date();
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();

    const monthEvents = visibleEvents.filter(ev => {
      const dt = new Date(ev.datetime);
      return dt.getFullYear() === y && dt.getMonth() === m;
    });

    monthCountEl.textContent = `${monthEvents.length} Event${monthEvents.length === 1 ? "" : "s"}`;
  }

  if (nextUpEl){
    const now = new Date();

    const nextEvent = visibleEvents
      .filter(ev => new Date(ev.datetime) >= now)
      .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))[0];

    if (!nextEvent){
      nextUpEl.textContent = "No upcoming event";
    } else {
      nextUpEl.textContent = `${nextEvent.title} • ${formatEventDateTime(new Date(nextEvent.datetime))}`;
    }
  }
}

function renderSelectedCalendarDay(){
  const labelEl = $("#calendarSelectedDateLabel");
  const eventsWrap = $("#calendarSelectedEvents");
  if (!labelEl || !eventsWrap) return;

  const selected = STATE.calendarSelectedDate || new Date();
  const dayEvents = getEventsForDate(selected);

  labelEl.textContent = formatLongDate(selected);

  if (!dayEvents.length){
    eventsWrap.innerHTML = `
      <div class="calendar-selected-empty">
        No events for this day yet. Tap <strong>+ Add to This Day</strong> to create one.
      </div>
    `;
    return;
  }

  eventsWrap.innerHTML = dayEvents.map(ev => {
    const dt = new Date(ev.datetime);
    return `
      <div class="calendar-selected-event-item">
        <div class="calendar-selected-event-top">
          <div class="calendar-selected-event-title">${sanitize(ev.title)}</div>
          <span class="badge">${sanitize(ev.host)}</span>
        </div>
        <div class="calendar-selected-event-meta">
          ${sanitize(formatEventDateTime(dt))} • ${sanitize(ev.location)}
        </div>
        <div class="calendar-selected-event-meta" style="margin-top:6px">
          RSVP${(ev.rsvps || 0) === 1 ? "" : "s"}: ${ev.rsvps || 0} • Check-ins: ${ev.checkins || 0}
        </div>
        ${ev.desc ? `<div class="calendar-selected-event-meta" style="margin-top:6px">${sanitize(ev.desc)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderMonthCalendar(){
  const labelEl = $("#calendarCurrentLabel");
  const grid = $("#calendarGrid");
  if (!labelEl || !grid) return;

  const current = STATE.calendarViewDate || new Date();
  const year = current.getFullYear();
  const month = current.getMonth();

  labelEl.textContent = formatMonthYear(current);

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const firstGridDate = new Date(year, month, 1 - startDay);

  const selectedKey = formatDateKey(STATE.calendarSelectedDate || new Date());
  const todayKey = formatDateKey(new Date());

  let html = "";

  for (let i = 0; i < 42; i++){
    const cellDate = new Date(firstGridDate);
    cellDate.setDate(firstGridDate.getDate() + i);

    const cellKey = formatDateKey(cellDate);
    const dayEvents = getEventsForDate(cellDate);
    const isOtherMonth = cellDate.getMonth() !== month;
    const isToday = cellKey === todayKey;
    const isSelected = cellKey === selectedKey;

    html += `
      <button
        class="calendar-day ${isOtherMonth ? "is-other-month" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}"
        type="button"
        data-date="${cellKey}"
      >
        <div class="calendar-day-number">${cellDate.getDate()}</div>
        <div class="calendar-day-events">
          ${dayEvents.slice(0,2).map(ev => `
            <span class="calendar-day-event-pill">${sanitize(ev.title)}</span>
          `).join("")}
          ${dayEvents.length > 2 ? `<span class="calendar-day-more">+${dayEvents.length - 2} more</span>` : ""}
        </div>
      </button>
    `;
  }

  grid.innerHTML = html;
}

function renderYearCalendar(){
  const yearGrid = $("#calendarYearGrid");
  if (!yearGrid) return;

  const current = STATE.calendarViewDate || new Date();
  const year = current.getFullYear();
  const todayKey = formatDateKey(new Date());

  let html = "";

  for (let month = 0; month < 12; month++){
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const firstGridDate = new Date(year, month, 1 - startDay);

    let miniDays = "";
    for (let i = 0; i < 42; i++){
      const cellDate = new Date(firstGridDate);
      cellDate.setDate(firstGridDate.getDate() + i);

      const cellKey = formatDateKey(cellDate);
      const hasEvent = getEventsForDate(cellDate).length > 0;
      const isOtherMonth = cellDate.getMonth() !== month;
      const isToday = cellKey === todayKey;

      miniDays += `
        <button
          class="calendar-mini-day ${hasEvent ? "has-event" : ""} ${isOtherMonth ? "is-other-month" : ""} ${isToday ? "is-today" : ""}"
          type="button"
          data-year-date="${cellKey}"
        >
          ${cellDate.getDate()}
        </button>
      `;
    }

    html += `
      <div class="calendar-mini-month" data-month-index="${month}">
        <div class="calendar-mini-month-title">
          ${sanitize(new Intl.DateTimeFormat(undefined, { month:"long" }).format(new Date(year, month, 1)))}
        </div>
        <div class="calendar-mini-weekdays">
          <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>
        <div class="calendar-mini-grid">
          ${miniDays}
        </div>
      </div>
    `;
  }

  yearGrid.innerHTML = html;
}

function syncCalendarViewMode(){
  const monthView = $("#calendarMonthView");
  const yearView = $("#calendarYearView");
  const monthBtn = $("#calendarMonthViewBtn");
  const yearBtn = $("#calendarYearViewBtn");

  const mode = STATE.calendarViewMode || "month";

  if (monthView) monthView.classList.toggle("hidden", mode !== "month");
  if (yearView) yearView.classList.toggle("hidden", mode !== "year");
  if (monthBtn) monthBtn.classList.toggle("active", mode === "month");
  if (yearBtn) yearBtn.classList.toggle("active", mode === "year");
}

function renderVisualCalendar(){
  updateCalendarSummary();
  renderMonthCalendar();
  renderYearCalendar();
  renderSelectedCalendarDay();
  syncCalendarViewMode();
}

function openVisualCalendar(){
  const dlg = $("#calendarViewDialog");
  if (!dlg) return;
  renderVisualCalendar();
  dlg.showModal();
}

function closeVisualCalendar(){
  const dlg = $("#calendarViewDialog");
  if (!dlg) return;
  dlg.close();
}

function prefillEventDialogForSelectedDay(){
  const dialog = $("#eventDialog");
  const form = $("#eventForm");
  const input = $('#eventForm input[name="datetime"]');

  if (!dialog || !form || !input) return;

  form.reset();
  resetEventVisibilityToggle();

  const selected = STATE.calendarSelectedDate || new Date();
  const prefill = new Date(selected);
  prefill.setHours(18, 0, 0, 0);

  const off = prefill.getTimezoneOffset();
  const localISO = new Date(prefill.getTime() - off * 60000).toISOString().slice(0,16);

  input.value = localISO;

  dialog.showModal();
}

/* =======================================================
   Scholarships (View pill buttons)
======================================================= */
function renderScholarships(){
  const ul = $("#schList");
  if (!ul) return;

  const searchInput = $("#schSearch");
  const term = (searchInput?.value || "").toLowerCase().trim();

  let arr = sortABC(seedScholarships, "title");

  if (term){
    arr = arr.filter(s =>
      String(s.title || "").toLowerCase().includes(term) ||
      String(s.amount || "").toLowerCase().includes(term) ||
      String(s.org || "").toLowerCase().includes(term) ||
      String(s.blurb || "").toLowerCase().includes(term) ||
      (s.tags || []).join(" ").toLowerCase().includes(term)
    );
  }

ul.innerHTML = arr.map((s, index) => `
  <li class="item scholarship-item" data-id="${sanitize(s.id)}">
    <div class="scholarship-card">
      <div class="scholarship-rank">${index + 1}</div>

      <div class="grow">
          <strong class="scholarship-title">${sanitize(s.title)}</strong>

          <div class="row small muted">
            <span class="badge">${sanitize(s.org)}</span>
            <span class="badge">${sanitize(s.amount)}</span>
          </div>

          <div class="sch-amount">Amount: ${sanitize(s.amount)}</div>

          <p class="small muted" style="margin-top:6px">
            ${sanitize(s.blurb)}
          </p>

          <div class="row small muted sch-tags">
            ${(s.tags || []).map(t => `<span class="badge">${sanitize(t)}</span>`).join("")}
          </div>
        </div>

        <button class="btn small btn-view" data-action="view" type="button">
          View
        </button>
      </div>
    </li>
  `).join("") || `<li class="item small muted">No scholarships found with that search.</li>`;
}

function onScholarshipClick(e){
  const btn = e.target.closest("button[data-action='view']");
  if (!btn) return;

  const li = e.target.closest(".item");
  if (!li) return;

  const id = li.dataset.id;
  const s = seedScholarships.find(x => x.id === id);
  if (!s) return;

  if (s.url){
    window.open(s.url, "_blank", "noopener,noreferrer");
  }
}

/* =======================================================
   Jobs — 100 Internships & Jobs + Saved Opportunities
======================================================= */

let JOBS_SAVED_MODE = false;

function jobSavedKey(){
  return STATE.me ? `ns-job-saved-${STATE.me.id}` : "ns-job-saved-demo";
}

function getSavedJobs(){
  return store.get(jobSavedKey(), []);
}

function saveSavedJobs(arr){
  store.set(jobSavedKey(), arr);
}

function updateSavedJobsButton(){
  const btn = $("#jobSavedBtn");
  if (!btn) return;

  const saved = getSavedJobs();

  if (saved.length > 0){
    btn.classList.remove("hidden");
    btn.textContent = JOBS_SAVED_MODE
      ? "← All Jobs"
      : `💾 Saved (${saved.length})`;
  } else {
    btn.classList.add("hidden");
    JOBS_SAVED_MODE = false;
  }
}

function getVisibleJobs(){
  const term = ($("#jobSearch")?.value || "").toLowerCase().trim();
  const saved = getSavedJobs();

  let arr = [...seedJobs];

  if (JOBS_SAVED_MODE){
    arr = arr.filter(j => saved.includes(j.id));
  }

  if (term){
    arr = arr.filter(j =>
      String(j.title || "").toLowerCase().includes(term) ||
      String(j.org || "").toLowerCase().includes(term) ||
      String(j.location || "").toLowerCase().includes(term) ||
      String(j.type || "").toLowerCase().includes(term) ||
      String(j.focus || "").toLowerCase().includes(term) ||
      String(j.bio || "").toLowerCase().includes(term)
    );
  }

  return sortABC(arr, "title");
}

function renderJobs(){
  const ul = $("#jobList");
  const note = $("#jobModeNote");
  if (!ul) return;

  updateSavedJobsButton();

  const arr = getVisibleJobs();
  const saved = getSavedJobs();

  if (note){
    if (JOBS_SAVED_MODE){
      note.textContent = arr.length
        ? `Showing ${arr.length} saved internship/job${arr.length === 1 ? "" : "s"}.`
        : "No saved internships or jobs match your search yet.";
    } else {
      note.textContent = arr.length
        ? `Showing ${arr.length} of 100 internships and jobs.`
        : "No internships or jobs match your search yet.";
    }
  }

  ul.innerHTML = arr.map((j, index) => {
    const isSaved = saved.includes(j.id);
    const savedLabel = isSaved ? "✓ Saved" : "Save";
    const rankNumber = index + 1;

    return `
      <li class="item job-card" data-id="${sanitize(j.id)}">
        <div class="job-card-main">
          <div class="job-card-copy">
            <div class="job-card-title">
              <span class="job-rank">${rankNumber}</span>
              <strong>${sanitize(j.title)}</strong>
            </div>

            <div class="job-company-line small">
              ${sanitize(j.org)} • ${sanitize(j.location)}
            </div>

            <p class="job-card-bio">
              ${sanitize(j.bio)}
            </p>

            <div class="job-card-meta">
              <span class="badge">${sanitize(j.type)}</span>
              <span class="badge">${sanitize(j.focus)}</span>
              <span class="badge">Black Innovator Value</span>
            </div>
          </div>

          <div class="job-card-actions">
            <button class="btn small btn-save ${isSaved ? "job-saved-active" : ""}" data-action="save" type="button">
              ${savedLabel}
            </button>

            <button class="btn small btn-apply" data-action="apply" type="button">
              Apply
            </button>
          </div>
        </div>
      </li>
    `;
  }).join("") || `
    <li class="item small muted">
      ${JOBS_SAVED_MODE ? "No saved internships or jobs yet. Go back to all jobs and tap Save." : "No matching internships or jobs found."}
    </li>
  `;
}

function onJobClick(e){
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const li = e.target.closest(".item");
  if (!li) return;

  const jobId = li.dataset.id;
  const job = seedJobs.find(j => j.id === jobId);
  if (!job) return;

  const action = btn.dataset.action;

  if (action === "apply"){
    applyForJob(job);
    return;
  }

  if (action === "save"){
    const saved = getSavedJobs();
    const idx = saved.indexOf(job.id);

    if (idx === -1){
      saved.push(job.id);
    } else {
      saved.splice(idx, 1);
    }

    saveSavedJobs(saved);

    if (JOBS_SAVED_MODE && saved.length === 0){
      JOBS_SAVED_MODE = false;
    }

    renderJobs();
  }
}

function toggleSavedJobsMode(){
  JOBS_SAVED_MODE = !JOBS_SAVED_MODE;
  renderJobs();
}

function applyForJob(job){
  if (!job || !job.url) return;

  STATE.metrics.apps++;
  window.open(job.url, "_blank", "noopener,noreferrer");
}

/* =======================================================
   Campus Locator — 100 Prospecting Programs + Favorites
======================================================= */

let CAMPUS_FAVORITES_MODE = false;

function campusFavKey(){
  return STATE.me ? `ns-campus-favs-${STATE.me.id}` : "ns-campus-favs-demo";
}

function getCampusFavs(){
  return store.get(campusFavKey(), []);
}

function saveCampusFavs(arr){
  store.set(campusFavKey(), arr);
}

function updateCampusFavoritesButton(){
  const btn = $("#campusFavoritesBtn");
  if (!btn) return;

  const favs = getCampusFavs();

  if (favs.length > 0){
    btn.classList.remove("hidden");
    btn.textContent = CAMPUS_FAVORITES_MODE
      ? `← All Programs`
      : `⭐ Favorites (${favs.length})`;
  } else {
    btn.classList.add("hidden");
    CAMPUS_FAVORITES_MODE = false;
  }
}

function getVisibleCampuses(){
  const term = ($("#campusSearch")?.value || "").toLowerCase().trim();
  const favs = getCampusFavs();

  let arr = [...seedCampuses];

  if (CAMPUS_FAVORITES_MODE){
    arr = arr.filter(c => favs.includes(c.id));
  }

  if (term){
    arr = arr.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.state.toLowerCase().includes(term) ||
      c.program.toLowerCase().includes(term)
    );
  }

  return sortABC(arr, "name");
}

function renderCampuses(){
  const ul = $("#campusList");
  const note = $("#campusModeNote");
  if (!ul) return;

  updateCampusFavoritesButton();

  const arr = getVisibleCampuses();
  const favs = getCampusFavs();

  if (note){
    if (CAMPUS_FAVORITES_MODE){
      note.textContent = arr.length
        ? `Showing ${arr.length} favorite innovation program${arr.length === 1 ? "" : "s"}.`
        : "No favorites match your search yet.";
    } else {
      note.textContent = arr.length
        ? `Showing ${arr.length} of 100 innovation prospecting campuses.`
        : "No programs match your search yet.";
    }
  }

  ul.innerHTML = arr.map((c, index) => {
    const isFav = favs.includes(c.id);
    const favLabel = isFav ? "★ Favorited" : "☆ Favorite";
    const rankNumber = index + 1;

    return `
      <li class="item campus-card" data-id="${sanitize(c.id)}">
        <div class="campus-card-main">
          <div class="campus-card-copy">
            <div class="campus-card-title">
              <span class="campus-rank">${rankNumber}</span>
              <strong>${sanitize(c.name)}</strong>
            </div>

            <div class="small muted">${sanitize(c.state)} • Innovation / Entrepreneurship Program</div>

            <p class="campus-card-program">
              ${sanitize(c.program)}
            </p>

            <div class="campus-card-meta">
              <span class="badge">Campus Prospect</span>
              <span class="badge">Black Innovator Value</span>
            </div>
          </div>

          <div class="campus-card-actions">
            <button class="btn small btn-explore" data-action="explore" type="button">
              Explore
            </button>

            <button class="btn small btn-favorite ${isFav ? "campus-fav-active" : ""}" data-action="favorite" type="button">
              ${favLabel}
            </button>
          </div>
        </div>
      </li>
    `;
  }).join("") || `
    <li class="item small muted">
      ${CAMPUS_FAVORITES_MODE ? "No favorite campuses yet. Go back to all programs and tap Favorite." : "No matching campuses found."}
    </li>
  `;
}

function onCampusClick(e){
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const li = e.target.closest(".item");
  if (!li) return;

  const campusId = li.dataset.id;
  const campus = seedCampuses.find(c => c.id === campusId);
  if (!campus) return;

  const action = btn.dataset.action;

  if (action === "explore"){
    window.open(campus.url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "favorite"){
    const favs = getCampusFavs();
    const idx = favs.indexOf(campus.id);

    if (idx === -1){
      favs.push(campus.id);
    } else {
      favs.splice(idx, 1);
    }

    saveCampusFavs(favs);

    if (CAMPUS_FAVORITES_MODE && favs.length === 0){
      CAMPUS_FAVORITES_MODE = false;
    }

    renderCampuses();
  }
}

function toggleCampusFavoritesMode(){
  CAMPUS_FAVORITES_MODE = !CAMPUS_FAVORITES_MODE;
  renderCampuses();
}
/* =======================================================
   Studio — Idea Roulette, Pitch Coach, Chemistry
======================================================= */
const roulettePrompts = [
  "Build a tool that helps first-gen students navigate financial aid forms.",
  "Create a campus map that highlights Black-owned businesses near school.",
  "Design a micro-scholarship platform funded by alumni and local partners.",
  "Launch a content studio that spotlights Black innovators in your city.",
  "Prototype a wellness check-in app specifically for student founders.",
  "Build an accountability buddy system for people applying to internships.",
  "Design a clean-energy dashboard for dorms that gamifies energy savings.",
  "Create a storytelling project documenting Black innovation at HBCUs."
];

function spinRoulette(remix){
  const idea = rp(roulettePrompts);
  const out = $("#rouletteOut");
  if (out) out.value = idea;

  // Update pitch template at the same time
  const pitch = $("#pitchTemplate");
  if (pitch){
    pitch.value =
`Problem: What is the specific challenge this idea tackles on your campus?
Solution: ${idea}
Who for: Describe the main students or community members who would use this.
Why now: Why is this moment important for trying this idea?
Traction: What simple experiment or pilot could you run in the next 4–6 weeks?
Ask: What support do you need (funding, space, mentors, teammates)?`;
  }

  if (!remix){
    alert("New Studio idea loaded—and your 60-sec pitch template is updated too.");
  }
}

function rouletteToFeed(){
  const text = ($("#rouletteOut").value || "").trim();
  if (!text){
    alert("Spin the roulette or write an idea first.");
    return;
  }
FEED_STATE.unshift({
  id: "p-" + Date.now(),
  author: STATE.me ? `${STATE.me.name} (Studio idea)` : "Studio Idea",
  audience: "all",
  text,
  likes: 0,
  comments: [],
  authorAvatar: getMyCommunityAvatar() || getCommunityAvatarFromName(STATE.me?.name || "Studio Idea")
});
  STATE.metrics.posts++;
  renderFeed();
  goto("dashboard");
  subnav("feed");
}

function scorePitch(){
  const input = ($("#pitchInput").value || "").trim();
  const box = $("#pitchScore");
  if (!box) return;
  if (!input){
    box.textContent = "Paste or write your pitch first.";
    return;
  }
  const len = input.split(/\s+/).length;
  let score = 60;
  if (len >= 80 && len <= 190) score += 20;
  if (/\bproblem\b/i.test(input)) score += 5;
  if (/\bsolution\b/i.test(input)) score += 5;
  if (/\bask\b/i.test(input)) score += 5;
  if (/\btraction\b/i.test(input)) score += 5;
  score = clamp(score, 40, 100);
  box.textContent = `Estimated clarity score: ${score}/100. This is just a coach — share with a real mentor next.`;
}

function fillChemistrySelects(){
  const a = $("#chemA");
  const b = $("#chemB");
  if (!a || !b) return;
  const skills = ["Product", "AI", "Design", "Media", "Hardware", "Community", "Health", "FinTech", "Clean Energy"];
  const needs  = ["Storytelling", "Engineering", "Funding", "Operations", "Design", "Growth", "Research"];
  a.innerHTML = skills.map(s => `<option value="${s}">${s}</option>`).join("");
  b.innerHTML = needs.map(s => `<option value="${s}">${s}</option>`).join("");
}

function runChemistry(){
  const a = $("#chemA").value;
  const b = $("#chemB").value;
  const out = $("#chemResult");
  if (!out) return;
  if (!a || !b){
    out.textContent = "Pick both sides of the collab first.";
    return;
  }
  if (a === "Product" && b === "Storytelling"){
    out.textContent = "🔥 High potential: a product builder + storyteller duo can ship and share quickly.";
  } else if (a === "AI" && b === "Research"){
    out.textContent = "Strong fit: document your experiments and you might publish together.";
  } else {
    out.textContent = `Solid combo: ${a} + ${b}. Define a 4–6 week mini project and test the chemistry.`;
  }
}

/* =======================================================
   Mentor Application Dialog
======================================================= */
function openMentorApplyDialog(){
  const dlg = $("#mentorApplyDialog");
  const form = $("#mentorApplyForm");
  if (!dlg || !form) return;

  // Pre-fill from logged-in user if available
  if (STATE.me){
    if (form.elements.name)  form.elements.name.value  = STATE.me.name || "";
    if (form.elements.email) form.elements.email.value = STATE.me.email || "";
  }

  dlg.showModal();
}

function closeMentorApplyDialog(){
  const dlg = $("#mentorApplyDialog");
  if (!dlg) return;
  dlg.close();
}

function onMentorApplySubmit(e){
  e.preventDefault();

  const form = $("#mentorApplyForm");
  const dlg = $("#mentorApplyDialog");
  if (!form || !dlg) return;

  const fd = new FormData(form);

  const application = {
    id: "mentor-app-" + Date.now(),
    name: (fd.get("name") || "").trim(),
    email: (fd.get("email") || "").trim(),
    company: (fd.get("company") || "").trim(),
    role: (fd.get("role") || "").trim(),
    focus: (fd.get("focus") || "").trim(),
    experience: (fd.get("experience") || "").trim(),
    reason: (fd.get("reason") || "").trim(),
    submittedAt: new Date().toISOString()
  };

  const key = STATE.me
    ? `ns-mentor-applications-${STATE.me.id}`
    : "ns-mentor-applications-demo";

  const applications = store.get(key, []);
  applications.unshift(application);
  store.set(key, applications);

  alert("Your mentor application has been submitted.");

  form.reset();
  dlg.close();
}

/* =======================================================
   Mentors (Request Intro buttons)
======================================================= */
function renderMentors(){
  const ul = $("#mentorList");
  if (!ul) return;

  const q = ($("#mentorSearch")?.value || "").trim().toLowerCase();
  const filter = ($("#mentorFilter")?.value || "all").trim().toLowerCase();

  const list = seedMentors.filter(m => {
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.org.toLowerCase().includes(q) ||
      m.campus.toLowerCase().includes(q) ||
      m.bio.toLowerCase().includes(q) ||
      (m.topics || []).some(t => t.toLowerCase().includes(q));

    const matchesFilter = filter === "all" || m.focus === filter;

    return matchesSearch && matchesFilter;
  });

  ul.innerHTML = list.map(m => {
    const filled = Number(m.filledMentees || 0);
    const max = Number(m.maxMentees || 1);
    const remaining = Math.max(0, max - filled);
    const percent = Math.max(0, Math.min(100, Math.round((filled / max) * 100)));
    const status = getMentorCapacityStatus(filled, max);
    const statusLabel = getMentorCapacityLabel(filled, max);

    return `
      <li class="item mentor-card-item" data-id="${sanitize(m.id)}">
        <article class="card mentor-card" style="margin:0">
          <div class="mentor-card-top">
            <div class="mentor-card-identity">
              <span class="avatar">${sanitize(initialBadge(m.name))}</span>
              <div>
                <h4 class="mentor-name">${sanitize(m.name)}</h4>
                <div class="muted small">${sanitize(m.title)} • ${sanitize(m.org)}</div>
                <div class="muted small">${sanitize(m.campus)}</div>
              </div>
            </div>

            <span class="badge">${sanitize(m.focus)}</span>
          </div>

          <p class="muted mentor-bio">${sanitize(m.bio)}</p>

          <div class="row" style="margin-bottom:12px">
            ${(m.topics || []).map(topic => `<span class="tag">${sanitize(topic)}</span>`).join("")}
          </div>

          <div class="small muted" style="margin-bottom:12px">
            Format: ${sanitize(m.format)}
          </div>

          <div class="mentor-capacity-card">
            <div class="mentor-capacity-top">
              <div class="mentor-capacity-title">Mentorship Availability</div>
              <div class="mentor-capacity-count">${filled}/${max} filled</div>
            </div>

            <div class="mentor-capacity-bar">
              <div class="mentor-capacity-bar-fill" style="width:${percent}%"></div>
            </div>

            <div class="mentor-capacity-bottom">
              <span class="mentor-capacity-note">Looking for ${max} mentee${max === 1 ? "" : "s"}</span>
              <span class="mentor-capacity-status ${status}">
                ${remaining === 0 ? "No spots left" : `${remaining} spot${remaining === 1 ? "" : "s"} left`}
              </span>
            </div>
          </div>

          <div class="row mentor-card-actions">
            <button class="btn btn-outline" type="button">View Profile</button>
            <button class="btn btn-primary" type="button" ${remaining === 0 ? "disabled" : ""}>
              ${remaining === 0 ? "Fully Booked" : `Request Mentorship • ${statusLabel}`}
            </button>
          </div>
        </article>
      </li>
    `;
  }).join("") || `<li class="item small muted">No mentors matched your search yet.</li>`;
}

function onMentorClick(e){
  const btn = e.target.closest("button[data-action='intro']");
  if (!btn) return;
  const li = e.target.closest(".item");
  if (!li) return;
  const id = li.dataset.id;
  const m = seedMentors.find(x => x.id === id);
  if (!m) return;
  alert(`In the full app, this would send an intro request to ${m.name} with your profile attached.`);
}

/* =======================================================
   Projects (I'd Like to Help buttons)
======================================================= */
function renderProjects(){
  const ul = $("#projectList");
  if (!ul) return;
  const term = ($("#projectSearch").value || "").toLowerCase();
  const stage = $("#projectFilter").value || "all";
  let arr = [...PROJECT_STATE];

  if (stage !== "all"){
    arr = arr.filter(p => p.stage === stage);
  }
  if (term){
    arr = arr.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.campus.toLowerCase().includes(term) ||
      p.tags.join(" ").toLowerCase().includes(term)
    );
  }

  ul.innerHTML = arr.map(p => `
    <li class="item" data-id="${p.id}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="grow">
          <strong>${sanitize(p.name)}</strong>
          <span class="badge">${sanitize(p.campus)}</span>
          <span class="badge">${p.stage === "idea" ? "IDEA" : p.stage === "prototype" ? "PROTOTYPE" : "LAUNCH"}</span>
          <p class="small muted" style="margin-top:4px">${sanitize(p.desc)}</p>
          <div class="row small muted" style="margin-top:4px">
            ${(p.tags||[]).map(t => `<span class="badge">${sanitize(t)}</span>`).join("")}
          </div>
     <p class="small muted" style="margin-top:4px">Needs: ${sanitize(p.needs || "Open to all kinds of help.")}</p>
${p.roles ? `<p class="small muted" style="margin-top:4px"><strong>Roles Needed:</strong> ${sanitize(p.roles)}</p>` : ""}
${p.protection ? `<p class="small muted" style="margin-top:4px"><strong>Idea Protection:</strong> ${sanitize(p.protection)}</p>` : ""}
${p.expectations ? `<p class="small muted" style="margin-top:4px"><strong>Team Expectations:</strong> ${sanitize(p.expectations)}</p>` : ""}
        </div>
        <button class="btn small btn-help" data-action="help">I'd like to help</button>
      </div>
    </li>
  `).join("") || `<li class="item small muted">No projects yet. Tap + Add Project to share what you're building.</li>`;
}

function onSaveProject(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const proj = {
    id: "pr-" + Date.now(),
    name: fd.get("name").trim(),
    campus: fd.get("campus").trim(),
    stage: fd.get("stage"),
    tags: (fd.get("tags") || "").split(",").map(s=>s.trim()).filter(Boolean),
desc: (fd.get("desc") || "").trim(),
needs: (fd.get("needs") || "").trim(),
roles: (fd.get("roles") || "").trim(),
protection: (fd.get("protection") || "").trim(),
expectations: (fd.get("expectations") || "").trim()
  };
  PROJECT_STATE.unshift(proj);
  renderProjects();
  $("#projectDialog").close();
  e.target.reset();
}

function onProjectClick(e){
  const btn = e.target.closest("button[data-action='help']");
  if (!btn) return;
  const li = e.target.closest(".item");
  if (!li) return;
  const id = li.dataset.id;
  const proj = PROJECT_STATE.find(p => p.id === id);
  if (!proj) return;
  alert(`In the full app, you'd be able to message the team behind “${proj.name}” and join their project.`);
}

/* =======================================================
   Playbook
======================================================= */
function renderPlaybook(){
  const ul = $("#playList");
  if (!ul) return;
  const term = ($("#playSearch").value || "").toLowerCase();
  let arr = [...playbookGuides];
  if (term){
    arr = arr.filter(g =>
      g.title.toLowerCase().includes(term) ||
      g.tag.toLowerCase().includes(term)
    );
  }
  ul.innerHTML = arr.map(g => `
    <li class="item" data-id="${g.id}">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <strong>${sanitize(g.title)}</strong>
          <div class="small muted">${sanitize(g.tag)}</div>
        </div>
      </div>
    </li>
  `).join("") || `<li class="item small muted">No guides found with that search.</li>`;
}

function showGuideDetail(id){
  const guide = playbookGuides.find(g => g.id === id);
  const panel = $("#playDetail");
  if (!guide || !panel) return;

  panel.innerHTML = `
    <h4>${sanitize(guide.title)}</h4>
    <p class="small muted">Tag: ${sanitize(guide.tag)}</p>
    <ul>
      ${guide.bullets.map(b => `<li>${sanitize(b)}</li>`).join("")}
    </ul>
    <p class="small muted" style="margin-top:6px">${sanitize(guide.callout)}</p>
  `;

  if (window.innerWidth <= 720){
    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function randomGuide(){
  if (!playbookGuides.length) return;
  const g = rp(playbookGuides);
  showGuideDetail(g.id);
}

/* =======================================================
   Wellness (affirmations, breathing, journal, check-ins)
======================================================= */
function renderJournalList(){
  const wrap = $("#journalList");
  if (!wrap) return;
  const entries = getJournalEntries();
  wrap.innerHTML = entries.slice().reverse().map(e => `
    <div class="journal-entry">
      <div class="small muted">${new Date(e.ts).toLocaleString()}</div>
      <div>${sanitize(e.text)}</div>
    </div>
  `).join("") || `<div class="small muted">Your saved entries will show up here.</div>`;
}

function renderWellness(){
  // Streak
  const entries = store.get(checkinKey(), []);
  const badge = $("#wellnessStreak");
  if (badge) badge.textContent = `Check-ins this week: ${entries.length}`;

  const verseTextEl = $("#bibleVerseText");
  const verseRefEl = $("#bibleVerseRef");

  if (verseTextEl && !verseTextEl.dataset.ready){
    verseTextEl.textContent = "Tap “Show Me a Verse” for a powerful uplifting Bible verse.";
    verseTextEl.dataset.ready = "1";
  }

  if (verseRefEl && !verseRefEl.dataset.ready){
    verseRefEl.textContent = "";
    verseRefEl.dataset.ready = "1";
  }

  renderJournalList();
}

function newAffirmation(){
  const text = rp(wellnessAffirmations);
  const el = $("#affirmationText");
  if (el) el.textContent = text;
}

async function startBreathing(){
  const el = $("#breathText");
  if (!el) return;
  el.textContent = "Inhale slowly for 4 seconds…";
  await wait(4000);
  el.textContent = "Hold gently for 4 seconds…";
  await wait(4000);
  el.textContent = "Exhale for 6 seconds…";
  await wait(6000);
  el.textContent = "Repeat this a few times. Your nervous system deserves this reset.";
}

function checkinKey(){
  return STATE.me ? `ns-checkins-${STATE.me.id}` : "ns-checkins-demo";
}

function logCheckin(){
  const mood = $("#moodSelect").value;
  const arr = store.get(checkinKey(), []);
  arr.push({ mood, ts:new Date().toISOString() });
  store.set(checkinKey(), arr);
  const badge = $("#wellnessStreak");
  if (badge) badge.textContent = `Check-ins this week: ${arr.length}`;
  const msg = $("#checkinStatus");
  if (msg){
    msg.textContent = "Logged. Thank you for checking in with yourself.";
  }
  STATE.metrics.checkins++;
}

function saveJournalEntry(){
  const txtEl = $("#journalText");
  const text = (txtEl.value || "").trim();
  if (!text){
    alert("Write a bit first.");
    return;
  }
  const arr = getJournalEntries();
  arr.push({ text, ts:new Date().toISOString() });
  saveJournalEntries(arr);
  txtEl.value = "";
  const status = $("#journalStatus");
  if (status) status.textContent = "Saved in this browser.";
  renderJournalList();
}

/* =======================================================
   Culture Cards
======================================================= */
const cultureCards = [
  {
    name:"Dr. Gladys West",
    image:"https://i.postimg.cc/YMVX8rx7/Chat-GPT-Image-Mar-10-2026-04-32-19-PM.png",
    line:"Helped develop the mathematical modeling behind GPS.",
    prompt:"How might you build a campus project that uses location data in a way that protects privacy?"
  },
  {
    name:"Lonnie Johnson",
    image:"https://i.postimg.cc/X4h2xjk1/Chat-GPT-Image-Mar-10-2026-04-39-54-PM.png",
    line:"NASA engineer and inventor of the Super Soaker.",
    prompt:"What playful experiment could you design that teaches engineering concepts to kids?"
  },
  {
    name:"Madam C. J. Walker",
    image:"https://i.postimg.cc/6tSHzWhN/Chat-GPT-Image-Mar-10-2026-04-44-05-PM.png",
    line:"Entrepreneur and philanthropist who built a haircare empire.",
    prompt:"How could you turn something from your own routine into a service or product that serves your community?"
  },
  {
    name:"Mark Dean",
    image:"https://i.postimg.cc/pR70kWJk/Chat-GPT-Image-Mar-10-2026-04-49-04-PM.png",
    line:"Co-inventor of the IBM PC architecture.",
    prompt:"If you redesigned a piece of everyday tech on campus for Black students, what would you change first?"
  },
  {
    name:"Cheryl McKissack Daniel",
    image:"https://i.postimg.cc/Tw7KjB0c/Cheryl_Mc_Kissack_Daniel.png",
    line:"Civil engineer and CEO of McKissack & McKissack, continuing a historic family construction legacy.",
    prompt:"What campus or community space could you help redesign so it serves people better for generations?"
  },
  {
    name:"Christopher Gray",
    image:"https://i.postimg.cc/1X8fvM7T/Christopher_Gray.png",
    line:"Founder of Path, an AI-powered platform expanding access to high-quality test preparation.",
    prompt:"How could you use technology or AI to make a life-changing opportunity more affordable and accessible?"
  },
  {
    name:"Dawn Dickson",
    image:"https://i.postimg.cc/NFZLSTW5/Dawn_Dickson.png",
    line:"Inventor and entrepreneur behind PopCom and Flat Out of Heels.",
    prompt:"What everyday customer experience feels outdated, and how could you reinvent it in a smarter way?"
  },
  {
    name:"Frederick McKinley Jones",
    image:"https://i.postimg.cc/L5Jnxv0R/Frederick_Mc_Kinley_Jones.png",
    line:"Inventor who revolutionized mobile refrigeration technology.",
    prompt:"What important resource or product could be delivered more safely, reliably, or efficiently through innovation?"
  },
  {
    name:"Garrett Morgan",
    image:"https://i.postimg.cc/yx2Wt9w4/Garett_Morgan.png",
    line:"Inventor of safety-focused innovations including the smoke hood and an early traffic signal.",
    prompt:"What danger, inconvenience, or overlooked safety issue around you could be solved with a simple invention?"
  },
  {
    name:"James E. West",
    image:"https://i.postimg.cc/7hjbd7pv/James_E_West.png",
    line:"Inventor and acoustician known for groundbreaking microphone technology.",
    prompt:"How could you improve the way people communicate, record, or amplify important voices?"
  },
  {
    name:"Kimberly Bryant",
    image:"https://i.postimg.cc/T1BhFmZL/Kimberly_Bryant.png",
    line:"Engineer and founder of Black Girls Code, opening doors in tech for the next generation.",
    prompt:"What platform, program, or experience could you create that helps more young people see themselves as innovators?"
  },
  {
    name:"Marie Van Brittan Brown",
    image:"https://i.postimg.cc/7PRC58bt/Marie_Van_Brittan_Brown.png",
    line:"Co-creator of one of the earliest home security systems.",
    prompt:"What problem related to safety, peace of mind, or protection could you solve with a thoughtful design?"
  }
];
function showCard(step){
  const cardEl = $("#cultureCard");
  if (!cardEl || !cultureCards.length) return;

  if (step === -1 || step === 1){
    const len = cultureCards.length;
    STATE.cultureIndex = (STATE.cultureIndex + step + len) % len;
  }

  const c = cultureCards[STATE.cultureIndex];

  cardEl.innerHTML = `
    <div class="culture-card-media">
    <img
  class="culture-card-image"
  src="${sanitize(c.image)}"
  alt="${sanitize(c.name)}"
  loading="lazy"
  data-culture-full="${sanitize(c.image)}"
  data-culture-name="${sanitize(c.name)}"
/>
    </div>

    <div class="culture-card-copy">
      <h4>${sanitize(c.name)}</h4>
      <p class="culture-card-line">${sanitize(c.line)}</p>
      <p class="culture-card-prompt">${sanitize(c.prompt)}</p>
    </div>
  `;
}

function inspireFromCard(){
  const c = cultureCards[STATE.cultureIndex];
  const ideaBox = $("#rouletteOut");
  if (ideaBox){
    ideaBox.value = `Inspired by ${c.name}: ${c.prompt}`;
  }
  goto("dashboard");
  subnav("studio");
}


function openCultureImage(src, name){
  const dlg = $("#cultureImageDialog");
  const img = $("#cultureImageFull");
  if (!dlg || !img) return;

  img.src = src || "";
  img.alt = name ? `${name} full image` : "Full culture image";

  if (!dlg.open) dlg.showModal();
}

function closeCultureImage(){
  const dlg = $("#cultureImageDialog");
  const img = $("#cultureImageFull");
  if (!dlg) return;

  dlg.close();

  if (img){
    img.src = "";
    img.alt = "Full culture image";
  }
}

function shuffleCultureCard(){
  if (!Array.isArray(cultureCards) || cultureCards.length === 0) return;

  const currentIndex = STATE.cultureIndex;
  let nextIndex = Math.floor(Math.random() * cultureCards.length);

  if (cultureCards.length > 1){
    while (nextIndex === currentIndex){
      nextIndex = Math.floor(Math.random() * cultureCards.length);
    }
  }

  STATE.cultureIndex = nextIndex;
  showCard(0);
}

function bindCultureImageModal(){
  const card = $("#cultureCard");
  const dlg = $("#cultureImageDialog");
  const closeBtn = $("#cultureImageClose");

  if (card && !card.dataset.cultureImageBound){
    card.dataset.cultureImageBound = "1";

    card.addEventListener("click", (e) => {
      const img = e.target.closest(".culture-card-image");
      if (!img) return;

      openCultureImage(
        img.getAttribute("data-culture-full") || img.getAttribute("src") || "",
        img.getAttribute("data-culture-name") || img.getAttribute("alt") || ""
      );
    });
  }

  if (closeBtn && !closeBtn.dataset.bound){
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", closeCultureImage);
  }

  if (dlg && !dlg.dataset.bound){
    dlg.dataset.bound = "1";

    dlg.addEventListener("click", (e) => {
      const modalBox = e.target.closest(".culture-image-modal");
      const clickedImage = e.target.closest(".culture-image-full");
      const clickedClose = e.target.closest("#cultureImageClose");

      if (clickedClose) return;
      if (clickedImage) return;
      if (!modalBox || e.target === dlg){
        closeCultureImage();
      }
    });

    dlg.addEventListener("cancel", () => {
      closeCultureImage();
    });
  }
}

/* =======================================================
   Quests (Claimed / Locked pills)
======================================================= */
const questData = [
  { id:"q1", title:"Post your first update", progress:"2/1 • +20 XP", status:"claimed" },
  { id:"q2", title:"Connect with 3 peers",   progress:"5/3 • +30 XP", status:"claimed" },
  { id:"q3", title:"RSVP to any event",      progress:"1/1 • +15 XP", status:"claimed" },
  { id:"q4", title:"Comment twice this week",progress:"0/2 • +25 XP", status:"locked" },
  { id:"q5", title:"Apply to one role",      progress:"2/1 • +30 XP", status:"claimed" }
];

function renderQuests(){
  const ul = $("#questList");
  if (!ul) return;
  ul.innerHTML = questData.map(q => `
    <li class="item" data-id="${q.id}">
      <div class="row quest-row">
        <div>
          <strong>${sanitize(q.title)}</strong>
          <div class="small muted">${sanitize(q.progress)}</div>
        </div>
        <span class="quest-status ${q.status}">
          ${q.status === "claimed" ? "Claimed" : "Locked"}
        </span>
      </div>
    </li>
  `).join("");

  const totalXp = questData
    .filter(q => q.status === "claimed")
    .reduce((sum,q) => {
      const match = q.progress.match(/\+(\d+)\s*XP/i);
      return sum + (match ? Number(match[1]) : 0);
    },0);
  const badge = $("#xpBadge");
  if (badge){
    const level = totalXp >= 60 ? 2 : 1;
    badge.textContent = `Level ${level} • ${totalXp} XP`;
  }
}

function onQuestClick(e){
  const li = e.target.closest(".item");
  if (!li) return;
  const id = li.dataset.id;
  const q = questData.find(x => x.id === id);
  if (!q) return;
  if (q.status === "locked"){
    alert("This quest is locked. Keep participating in NSAAI and it will unlock soon.");
  } else {
    alert("Already claimed — keep stacking impact!");
  }
}

/* =======================================================
   Partners (Explore buttons)
======================================================= */
function renderPartners(){
  const ul = $("#partnerList");
  if (!ul) return;

  const input = $("#partnerSearch");
  const term = (input?.value || "").trim().toLowerCase();

  let arr = sortABC(seedPartners, "name");

  if (term){
    arr = arr.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.type.toLowerCase().includes(term) ||
      p.bio.toLowerCase().includes(term) ||
      (p.tags || []).join(" ").toLowerCase().includes(term)
    );
  }

  const note = $("#partnerModeNote");
  if (note){
    note.textContent = term
      ? `Showing ${arr.length} matching organizations and events.`
      : `Showing all ${seedPartners.length} organizations and events.`;
  }

  ul.innerHTML = arr.map((p, index) => `
    <li class="item partner-card" data-id="${sanitize(p.id)}">
      <div class="partner-card-top">
        <div class="partner-number">${String(index + 1).padStart(2, "0")}</div>

        <div class="partner-card-main">
          <div class="partner-title-row">
            <strong>${sanitize(p.name)}</strong>
            <span class="partner-type-pill">${sanitize(p.type)}</span>
          </div>

          <p class="small muted partner-bio">${sanitize(p.bio)}</p>

          <div class="partner-tags">
            ${(p.tags || []).map(t => `<span class="badge">${sanitize(t)}</span>`).join("")}
          </div>
        </div>

        <div class="partner-card-actions">
          <button class="btn small btn-explore" data-action="explore" type="button">
            Explore
          </button>
        </div>
      </div>
    </li>
  `).join("") || `
    <li class="item small muted partner-empty">
      No matching organizations or events found.
    </li>
  `;
}

function onPartnerClick(e){
  const btn = e.target.closest("button[data-action='explore']");
  if (!btn) return;

  const li = e.target.closest(".item");
  if (!li) return;

  const partnerId = li.dataset.id;
  const partner = seedPartners.find(p => p.id === partnerId);
  if (!partner || !partner.url) return;

  window.open(partner.url, "_blank", "noopener,noreferrer");
}

/* =======================================================
   Analytics drawer
======================================================= */
function openAnalytics(){
  const drawer = $("#analytics");
  if (!drawer) return;
  $("#mPosts").textContent    = STATE.metrics.posts;
  $("#mLikes").textContent    = STATE.metrics.likes;
  $("#mRsvps").textContent    = STATE.metrics.rsvps;
  $("#mCheckins").textContent = STATE.metrics.checkins;
  $("#mApps").textContent     = STATE.metrics.apps;
  $("#mMinutes").textContent  = minutesSince(STATE.timerStart);

  buildSpark("#sparkActivity", STATE.metrics.posts + STATE.metrics.likes);
  buildSpark("#sparkConnections", STATE.metrics.connections || 0);

  drawer.classList.remove("hidden");
}

function closeAnalytics(){
  const drawer = $("#analytics");
  if (drawer) drawer.classList.add("hidden");
}

function buildSpark(selector, intensity){
  const wrap = $(selector);
  if (!wrap) return;
  const cells = 10;
  wrap.innerHTML = "";
  for (let i=0;i<cells;i++){
    const span = document.createElement("div");
    span.className = "cell";
    if (i > cells - 1 - clamp(Math.floor(intensity/2),0,cells)){
      span.classList.add("hot");
    }
    wrap.appendChild(span);
  }
}


function applyNSAAISocialLinks(){
  const website = document.querySelector('#sub-socials .social-btn.website');
  const instagram = document.querySelector('#sub-socials .social-btn.ig');
  const linkedin = document.querySelector('#sub-socials .social-btn.ln');

  if (website){
    website.href = "https://www.thensaai.org/";
    website.target = "_blank";
    website.rel = "noopener noreferrer";
  }

  if (instagram){
    instagram.href = "https://www.instagram.com/nsaai_22/";
    instagram.target = "_blank";
    instagram.rel = "noopener noreferrer";
  }

  if (linkedin){
    linkedin.href = "https://www.linkedin.com/company/national-society-for-african-american-innovators-nsaai/";
    linkedin.target = "_blank";
    linkedin.rel = "noopener noreferrer";
  }
}

applyNSAAISocialLinks();


/* =======================================================
   Profile events + list click handlers (second DOM ready)
======================================================= */
window.addEventListener("DOMContentLoaded", () => {


  const schList = $("#schList");
  if (schList) schList.addEventListener("click", onScholarshipClick);

  const eventList = $("#eventList");
  if (eventList) eventList.addEventListener("click", onEventAction);

  const campusList = $("#campusList");
  if (campusList) campusList.addEventListener("click", onCampusClick);

  const mentorList = $("#mentorList");
  if (mentorList) mentorList.addEventListener("click", onMentorClick);

  const projectList = $("#projectList");
  if (projectList) projectList.addEventListener("click", onProjectClick);

  const playList = $("#playList");
  if (playList) playList.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    showGuideDetail(li.dataset.id);
  });

  const partnerList = $("#partnerList");
  if (partnerList) partnerList.addEventListener("click", onPartnerClick);

  const questList = $("#questList");
  if (questList) questList.addEventListener("click", onQuestClick);
  bindStudyOnce();
});
