    const firebaseConfig = {
      apiKey: "AIzaSyD0wD1laV1CE5cD6CJnHsNEBMAggpLFrAw",
      authDomain: "app-web-30f0e.firebaseapp.com",
      projectId: "app-web-30f0e",
      storageBucket: "app-web-30f0e.firebasestorage.app",
      messagingSenderId: "122904965586",
      appId: "1:122904965586:web:39a3f5c9b4ac815070d80b",
      measurementId: "G-HFWT1BBW0F"
    };

    // Initialize Firebase
    const app = firebase.initializeApp(firebaseConfig);
    const db = app.firestore();

    // Collection/Document structure for simplicity (mimicking localStorage)
    const DATA_STORE_COLLECTION = 'data_store';

    // Global in-memory cache
    let classesCache = [];
    let studentsCache = [];
    let attendanceCache = {};
    let announcementsCache = [];
    
    // Custom Error Message
    const FIREBASE_ERROR_MESSAGE = "خطا در اتصال به دیتابیس. فیلترشکن خود را روشن کنید یا اگر روشن هست به مکانی دیگر وصل شوید.";

    /**
     * Wraps an async Firebase operation with custom error handling.
     * @param {function} operation - The async function containing the Firebase call.
     * @returns {Promise<any>} The result of the operation.
     */
    async function handleFirebaseOperation(operation) {
      try {
        return await operation();
      } catch (error) {
        console.error("Firebase Error:", error);
        alert(FIREBASE_ERROR_MESSAGE + "\n\nجزئیات خطا: " + error.message.substring(0, 100) + '...'); // Truncate error message
        throw new Error('Firebase operation failed due to connection error.');
      }
    }

    // Asynchronous Fetch Data from Firestore
    async function fetchData(docId, defaultValue) {
      return await handleFirebaseOperation(async () => {
        const docRef = db.collection(DATA_STORE_COLLECTION).doc(docId);
        const doc = await docRef.get();
        return doc.exists ? doc.data().data || defaultValue : defaultValue;
      });
    }

    // Asynchronous Save All Data to Firestore (using batch for atomic update)
    async function saveAllData() {
      await handleFirebaseOperation(async () => {
        const batch = db.batch();
        
        // Prepare batch writes
        batch.set(db.collection(DATA_STORE_COLLECTION).doc('classes'), { data: classesCache });
        batch.set(db.collection(DATA_STORE_COLLECTION).doc('students'), { data: studentsCache });
        batch.set(db.collection(DATA_STORE_COLLECTION).doc('attendance'), { data: attendanceCache });
        batch.set(db.collection(DATA_STORE_COLLECTION).doc('announcements'), { data: announcementsCache });
        
        await batch.commit();
      });
    }

    // Data access functions (now synchronous, reading from cache)
    const $ = id=>document.getElementById(id);
    let currentRole = 'admin';

    function uid(){return 'c'+Date.now()+Math.floor(Math.random()*99)}
    function getClasses(){return classesCache;}
    function getStudents(){return studentsCache;}
    function getAttendance(){return attendanceCache;}
    function getAnnouncements(){return announcementsCache;}

    // --- STUDENT SELECT POPULATION HELPER ---
    function populateStudentSelect(classId, selectId){
      const select = $(selectId);
      select.innerHTML = '';
      if (!classId) return;
      const students = getStudents().filter(s => s.classId === classId);
      if (students.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'کلاسی خالی است';
        opt.value = '';
        select.appendChild(opt);
        return;
      }
      students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nid;
        opt.textContent = s.name + ' (' + s.nid + ')';
        select.appendChild(opt);
      });
    }
    
    window.populateDependentStudentSelect = function(classSelectId, studentSelectId) {
      const classId = $(classSelectId).value;
      populateStudentSelect(classId, studentSelectId);
    }
    
    // --- ROLE MANAGEMENT (Shallow implementation) ---
    function setCurrentRole(role){
      currentRole = role;
      document.querySelectorAll('.admin-only').forEach(el=>el.style.display = (role === 'admin' ? 'block' : 'none'));
      document.querySelectorAll('.admin-teacher-only').forEach(el=>el.style.display = (role === 'admin' || role === 'teacher' ? 'block' : 'none'));

      if(role === 'student'){
        showSection('student-view', 'btn-student-view');
      } else if (role === 'teacher') {
        showSection('dashboard', 'btn-dashboard');
      } else {
        showSection('panel', 'btn-panel');
      }
      
      const msgBox = $('dashboard').querySelector('.right-panel .card:nth-child(3)');
      if(msgBox) msgBox.style.display = (role === 'admin' || role === 'teacher' ? 'block' : 'none');
    }

    function refreshLists(){
      const classes=getClasses();
      const studentClasses = $('student-class');
      const dash = $('dashboard-class');
      const quick = $('select-class-quick');
      const tuitionClass = $('tuition-class');
      const bookClassSelect = $('book-class-select');
      
      [studentClasses,dash,quick,tuitionClass,bookClassSelect].forEach(sel=>{
        sel.innerHTML='';
        classes.forEach(c=>{
          const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name+' — معلم: '+c.teacher;sel.appendChild(opt);
        })
      })
      
      if (classes.length > 0) {
        populateStudentSelect(tuitionClass.value, 'tuition-student-select');
        populateStudentSelect(bookClassSelect.value, 'book-student-select');
        // Set initial value for dashboard class if available
        if ($('dashboard').style.display === 'block') {
          updateDashboardStudents();
        }
      }
      
      const clDiv=$('classes-list');clDiv.innerHTML='';
      if(classes.length===0){clDiv.textContent='هنوز کلاسی ساخته نشده.';return}
      classes.forEach(c=>{
        const d=document.createElement('div');d.className='small';d.innerHTML=`<strong>${c.name}</strong> — معلم: ${c.teacher} — کتاب: ${c.book} — ترم‌ها: ${c.terms} — جلسات/ترم: ${c.sessionsPerTerm}`;
        clDiv.appendChild(d);
      })
      
      refreshAnnouncementsList();
    }

    async function addClass(){
      const name=$('class-name').value.trim();
      const teacher=$('class-teacher').value.trim();
      const book=$('class-book').value.trim();
      const terms=Number($('class-terms').value)||1;
      const spt=Number($('sessions-per-term').value)||10;
      if(!name||!teacher){alert('لطفاً نام کلاس و نام معلم را وارد کنید.');return}
      
      const id=uid();
      classesCache.push({id,name,teacher,book,terms,sessionsPerTerm:spt,currentTerm:1, announcements: []});
      
      await saveAllData();

      refreshLists();
      alert('کلاس ذخیره شد. حالا می‌توانید زبان‌آموز اضافه کنید یا به داشبورد بروید.');
      $('class-name').value='';$('class-teacher').value='';$('class-book').value='';
    }

    async function deleteClass(){
      const classes=getClasses();
      const sel=$('select-class-quick');
      if(classes.length===0){alert('کلاسی برای حذف وجود ندارد.');return}
      const id=sel.value||classes[0].id;
      if(!confirm('آیا مطمئنید که می‌خواهید این کلاس و تمام اطلاعات مربوطه حذف شود؟ (فقط مدیر می‌تواند حذف کند)'))return;
      
      classesCache = classesCache.filter(c=>c.id!==id);
      // remove students and attendance for that class from cache
      studentsCache = studentsCache.filter(s=>s.classId!==id);
      delete attendanceCache[id];
      
      await saveAllData();

      refreshLists();buildAttendanceTable();
    }
    
    async function addStudent(){
      const nid=$('student-nid').value.trim();
      const name=$('student-name').value.trim();
      const classId=$('student-class').value;
      if(!nid||!name||!classId){alert('لطفاً همه فیلدها را پر کنید.');return}
      
      // Check if the student already exists in this class
      if(studentsCache.find(s=>s.nid===nid && s.classId===classId)){alert('این زبان‌آموز قبلاً به این کلاس افزوده شده است.');return}
      
      // Check if student exists globally 
      const existingStudent = studentsCache.find(s => s.nid === nid);
      const cls=classesCache.find(c=>c.id===classId);
      
      if (existingStudent) {
        studentsCache.push({nid, name, classId, tuition: existingStudent.tuition || [], books: existingStudent.books || [], messages: existingStudent.messages || []});
      } else {
        studentsCache.push({nid, name, classId, tuition: [], books: [], messages: []});
      }
      
      // initialize attendance entry
      const total = cls.terms * cls.sessionsPerTerm;
      attendanceCache[classId]=attendanceCache[classId]||{};
      attendanceCache[classId][nid]={present:new Array(total).fill(null), grades:{}};
      
      await saveAllData();

      $('student-nid').value='';$('student-name').value='';
      alert('زبان‌آموز اضافه شد و جدول حضور برایش ساخته شد.');
      buildAttendanceTable();
      refreshLists();
    }

    async function deleteStudent(){
      const nid=$('student-nid').value.trim();
      const classId=$('student-class').value;
      if(!nid||!classId){alert('کد ملی و کلاس را انتخاب کنید.');return}
      if(!confirm(`آیا مطمئنید که زبان‌آموز با کد ملی ${nid} از این کلاس حذف شود؟ (سابقه نمرات و حضور این کلاس پاک می‌شود)`))return;
      
      const initialCount = studentsCache.length;
      studentsCache = studentsCache.filter(s=>!(s.nid===nid && s.classId===classId));
      
      if(attendanceCache[classId] && attendanceCache[classId][nid]) delete attendanceCache[classId][nid];

      await saveAllData();

      if (initialCount > studentsCache.length) {
        alert('زبان‌آموز از کلاس حذف شد.');
      } else {
        alert('زبان‌آموز در این کلاس یافت نشد.');
      }
      buildAttendanceTable();
      refreshLists();
    }

    async function saveTuition(){
      const nid=$('tuition-student-select').value;
      const clsId=$('tuition-class').value;
      const amount=Number($('tuition-amount').value);
      const date=$('tuition-date').value;
      if(!nid||!clsId||isNaN(amount)||!date){alert('لطفاً همه فیلدهای شهریه را پر کنید و زبان‌آموز را انتخاب کنید.');return}

      const studentEntries = studentsCache.filter(s => s.nid === nid);
      if(studentEntries.length === 0) { alert('زبان‌آموز یافت نشد.'); return; }

      const masterEntry = studentEntries[0];
      const newTuition = {amount, date, classId: clsId};
      
      if(masterEntry.tuition.find(t => t.date === date && t.classId === clsId && t.amount === amount)){
        alert('این پرداخت قبلاً برای این کلاس در همین تاریخ ثبت شده است.');
        return;
      }

      masterEntry.tuition = masterEntry.tuition.filter(t => t.amount).concat([newTuition]);

      studentEntries.forEach(s => {
        s.tuition = masterEntry.tuition;
      });
      
      await saveAllData();

      alert('پرداخت شهریه ذخیره شد (فقط مدیر می‌تواند ثبت و تغییر دهد).');
      $('tuition-amount').value='';
    }

    async function saveBook(){
      const nid=$('book-student-select').value;
      const clsId=$('book-class-select').value;
      const name=$('book-name').value.trim();
      const date=$('book-date').value;
      if(!nid||!name||!date||!clsId){alert('لطفاً همه فیلدهای سابقه کتاب را پر کنید و کلاس/زبان‌آموز را انتخاب کنید.');return}

      const studentEntries = studentsCache.filter(s => s.nid === nid);
      if(studentEntries.length === 0) { alert('زبان‌آموز یافت نشد.'); return; }

      const masterEntry = studentEntries[0];
      const newBook = {name, date};
      
      if(masterEntry.books.find(b => b.name === name && b.date === date)){
        alert('این سابقه کتاب قبلاً ثبت شده است.');
        return;
      }
      
      masterEntry.books = masterEntry.books.filter(b => b.name).concat([newBook]);
      
      studentEntries.forEach(s => {
        s.books = masterEntry.books;
      });
      
      await saveAllData();

      alert('سابقه کتاب ذخیره شد (فقط مدیر می‌تواند ثبت و تغییر دهد).');
      $('book-name').value='';
    }

    async function sendMessage(senderRole){
      const nid=$('message-student-select').value;
      const text=$('message-text').value.trim();
      if(!nid||!text){alert('زبان‌آموز و متن پیام را وارد کنید.');return}
      
      const studentEntries = studentsCache.filter(s => s.nid === nid);
      if(studentEntries.length === 0) { alert('زبان‌آموز یافت نشد.'); return; }

      const masterEntry = studentEntries[0];
      const newMessage = {sender: senderRole, text, date: new Date().toLocaleDateString('fa-IR')};
      
      masterEntry.messages = masterEntry.messages.filter(m => m.text).concat([newMessage]);

      studentEntries.forEach(s => {
        s.messages = masterEntry.messages;
      });
      
      await saveAllData();

      alert('پیام برای زبان‌آموز ارسال شد (فقط معلم/مدیر می‌توانند ارسال کنند).');
      $('message-text').value='';
    }
    $('send-message').addEventListener('click',()=>sendMessage(currentRole));
    
    async function addAnnouncement(){
      const title=$('announcement-title').value.trim();
      const text=$('announcement-text').value.trim();
      if(!title||!text){alert('عنوان و متن اطلاعیه را وارد کنید.');return}

      announcementsCache.unshift({title, text, date: new Date().toLocaleDateString('fa-IR')});
      
      await saveAllData();

      $('announcement-title').value='';$('announcement-text').value='';
      alert('اطلاعیه عمومی ثبت شد.');
      refreshAnnouncementsList();
    }
    $('add-announcement').addEventListener('click', addAnnouncement);

    function refreshAnnouncementsList(){
      // Reads from announcementsCache, no change needed
      const announcements = getAnnouncements();
      const listDiv = $('announcement-list');
      listDiv.innerHTML = '';
      if(announcements.length === 0) {
        listDiv.innerHTML = '<div class="small">اطلاعیه‌ای ثبت نشده است.</div>';
        return;
      }
      announcements.slice(0, 5).forEach(announcement => {
        const d = document.createElement('div');
        d.className = 'card small';
        d.style.marginBottom = '6px';
        d.innerHTML = `<strong>${announcement.title}</strong><span style="float:left">${announcement.date}</span><p style="margin-top:4px">${announcement.text}</p>`;
        listDiv.appendChild(d);
      });
      if(announcements.length > 5) {
        listDiv.innerHTML += '<div class="small" style="text-align:center">... اطلاعیه‌های قدیمی‌تر موجود است.</div>';
      }
    }
    
    function updateDashboardStudents(){
      const classId = $('dashboard-class').value;
      populateStudentSelect(classId, 'search-student-select');
      populateStudentSelect(classId, 'grade-student-select');
      populateStudentSelect(classId, 'message-student-select');
    }


    async function buildAttendanceTable(){
      const classId=$('dashboard-class').value||$('select-class-quick').value;
      const wrap=$('attendance-table-wrap');wrap.innerHTML='';
      if(!classId){wrap.innerHTML='<div class="small">ابتدا یک کلاس انتخاب کنید.</div>';return}
      const classes=getClasses();const cls=classes.find(c=>c.id===classId);
      if(!cls){wrap.innerHTML='<div class="small">کلاس یافت نشد.</div>';return}
      const students=getStudents().filter(s=>s.classId===classId);
      const attendance=getAttendance();

      // Checkbox change handler (now async to save to Firebase)
      function handleCheckboxChange(stNid, sessionIndex, cb) {
        return async () => {
          const entry = attendance[classId][stNid] || {present:[], grades:{}};
          entry.present[sessionIndex] = cb.checked;
          attendanceCache[classId][stNid] = entry;

          await saveAllData(); // Save to Firebase

          updateStudentStatsPanel($('search-student-select').value,classId);
        };
      }
      
      const totalCols = cls.terms * cls.sessionsPerTerm;
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const trh=document.createElement('tr');
      trh.innerHTML='<th>ردیف</th><th>کدملی</th><th>نام</th>';
      for(let t=1;t<=cls.terms;t++){
        for(let s=1;s<=cls.sessionsPerTerm;s++){
          const th=document.createElement('th');th.textContent=`ت${t} ج${s}`;trh.appendChild(th);
        }
      }
      trh.innerHTML += '<th>غیبت‌ها</th><th>ایندکس</th>';
      thead.appendChild(trh);table.appendChild(thead);

      const tbody=document.createElement('tbody');
      students.forEach((st,idx)=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${idx+1}</td><td>${st.nid}</td><td style="text-align:left;padding-right:8px">${st.name}</td>`;
        const entry = attendance[classId][st.nid] || {present:new Array(totalCols).fill(null), grades:{}};
        for(let i=0;i<totalCols;i++){
          const td=document.createElement('td');
          const cb=document.createElement('input');cb.type='checkbox';cb.className='session-checkbox';
          if(entry.present[i]===true)cb.checked=true;
          if(entry.present[i]===null)cb.indeterminate=true;
          
          if (currentRole === 'admin' || currentRole === 'teacher') {
            cb.addEventListener('change', handleCheckboxChange(st.nid, i, cb));
          } else {
            cb.disabled = true;
          }
          td.appendChild(cb);tr.appendChild(td);
        }
        // absences and index
        const absTd=document.createElement('td');absTd.className='small';absTd.textContent=calcAbsences(entry.present);
        const idxTd=document.createElement('td');
        if (currentRole === 'admin') {
          idxTd.innerHTML=`<button class="small" onclick="showOnlyStudent('${st.nid}','${classId}')">نمایش</button>`;
        } else {
          idxTd.textContent = '-';
        }
        tr.appendChild(absTd);tr.appendChild(idxTd);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);wrap.appendChild(table);
      
      const currentTermInput=$('dashboard-current-term');currentTermInput.value = cls.currentTerm||1;
      // New async handler for term change
      currentTermInput.onchange = async ()=>{
        cls.currentTerm = Number(currentTermInput.value)||1; 
        await saveAllData(); // Save the new term number
        updateStudentStatsPanel($('search-student-select').value,classId);
      }
      if (currentRole !== 'admin') { currentTermInput.disabled = true; }
    }

    function calcAbsences(arr){
      if(!arr) return 0;let c=0;arr.forEach(v=>{if(v===false)c++});return c;
    }

    window.showOnlyStudent = function(nid,classId){
      $('btn-dashboard').click();
      setTimeout(async ()=>{ // Use async to await buildAttendanceTable
        $('dashboard-class').value=classId; 
        updateDashboardStudents();
        await buildAttendanceTable(); // Now async
        $('search-student-select').value=nid; 
        showStudentFromSearch(); 
      },50);
    }

    function updateStudentStatsPanel(nid,classId){
      // Reads from cache, no change needed (except for getting the name)
      const classes=getClasses();const cls=classes.find(c=>c.id===classId);
      const attendance=getAttendance();const entry=(attendance[classId]||{})[nid];
      const panel=$('student-stats');
      if(!entry){panel.innerHTML='اطلاعاتی برای این زبان‌آموز وجود ندارد.';return}
      const totalPerTerm = cls.sessionsPerTerm;
      const curTerm = Number($('dashboard-current-term').value)||cls.currentTerm||1;
      const startIndex = (curTerm-1)*totalPerTerm; const endIndex = startIndex + totalPerTerm;
      const termSlice = entry.present.slice(startIndex,endIndex);
      const marked = termSlice.filter(v=>v!==null).length;
      const abs = termSlice.filter(v=>v===false).length;
      const present = termSlice.filter(v=>v===true).length;
      const remaining = termSlice.filter(v=>v===null).length;
      const grades = entry.grades || {};
      const gradeCur = grades[curTerm]!==undefined ? grades[curTerm] : 'ثبت نشده';
      
      // Find student name from cache
      const studentEntry = getStudents().find(s=>s.nid===nid && s.classId===classId);

      panel.innerHTML = `<div><strong>نام:</strong> ${studentEntry?.name || '-'} </div>`+
                        `<div><strong>ترم جاری:</strong> ${curTerm} — حضور: ${present} — غیبت: ${abs} — ثبت شده: ${marked} — باقیمانده: ${remaining}</div>`+
                        `<div><strong>نمره ترم ${curTerm}:</strong> ${gradeCur}</div>`+
                        `<div style="margin-top:6px" class="small">جلسات کل ترم: ${totalPerTerm}</div>`;
    }

    function showStudentFromSearch(){
      const nid=$('search-student-select').value;
      const classId=$('dashboard-class').value;
      if(!nid||!classId){alert('کلاس و زبان‌آموز را انتخاب کنید.');return}
      updateStudentStatsPanel(nid,classId);
      
      $('grade-student-select').value = nid;
      $('message-student-select').value = nid;
    }

    async function saveGrade(){
      const nid=$('grade-student-select').value;
      const clsId=$('dashboard-class').value;
      const term=Number($('grade-term').value)||1;
      const g=Number($('grade-value').value);
      if(!nid||!clsId||isNaN(g)||g < 0 || g > 100){alert('اطلاعات نمره ناقص یا خارج از محدوده (۰-۱۰۰) است.');return}
      
      attendanceCache[clsId]=attendanceCache[clsId]||{};
      attendanceCache[clsId][nid]=attendanceCache[clsId][nid]||{present:[],grades:{}};
      attendanceCache[clsId][nid].grades = attendanceCache[clsId][nid].grades || {};
      attendanceCache[clsId][nid].grades[term]=g;
      
      await saveAllData();

      alert('نمره ذخیره شد (فقط معلم/مدیر می‌توانند ثبت کنند).');
      $('grade-value').value='';
      if ($('search-student-select').value === nid) {
        updateStudentStatsPanel(nid, clsId);
      }
    }

    async function studentViewShow(){
      // Reads from cache, no change needed (only fetching data is async)
      const nid=$('sv-nid').value.trim();
      const out=$('sv-result');out.innerHTML='';
      if(!nid){out.innerHTML='<div class="small">لطفاً کد ملی را وارد کنید.</div>';return}
      
      const classes=getClasses();
      const students=getStudents();
      
      const studentEntries = students.filter(s=>s.nid===nid);
      
      if(studentEntries.length === 0){out.innerHTML='<div class="small">زبان‌آموز با این کد ملی یافت نشد.</div>';return}
      
      const st = studentEntries[0]; 
      
      out.appendChild(document.createElement('h3')).textContent = 'وضعیت زبان‌آموز: ' + st.name + ' (' + st.nid + ')';
      
      studentEntries.forEach(entry => {
        const clsId = entry.classId;
        const cls = classes.find(c => c.id === clsId);
        const attendance=getAttendance();const attEntry=(attendance[clsId]||{})[nid];
        
        out.appendChild(document.createElement('h4')).textContent = 'سوابق نمره و حضور در کلاس ' + (cls?.name || 'نامعلوم');
        
        if(attEntry && cls){
          const totalCols = cls.terms * cls.sessionsPerTerm;
          const tbl=document.createElement('table');
          const h=document.createElement('tr');h.innerHTML='<th>ترم</th><th>حضور</th><th>غیبت</th><th>ثبت شده</th><th>باقیمانده</th><th>نمره</th>';
          tbl.appendChild(h);
          for(let t=1;t<=cls.terms;t++){
            const sIndex=(t-1)*cls.sessionsPerTerm; const slice = attEntry.present.slice(sIndex,sIndex+cls.sessionsPerTerm);
            const present = slice.filter(v=>v===true).length; const absent = slice.filter(v=>v===false).length; const marked = slice.filter(v=>v!==null).length; const remaining = slice.filter(v=>v===null).length;
            const tr=document.createElement('tr'); tr.innerHTML=`<td>${t}</td><td>${present}</td><td>${absent}</td><td>${marked}</td><td>${remaining}</td><td>${(attEntry.grades && attEntry.grades[t]!==undefined)?attEntry.grades[t]:'-'}</td>`; tbl.appendChild(tr);
          }
          out.appendChild(tbl);
          const totalAbs = attEntry.present.filter(v=>v===false).length;const totalMarked=attEntry.present.filter(v=>v!==null).length;
          const div=document.createElement('div');div.className='small';div.style.marginTop='8px';div.innerHTML=`<div><strong>کل غیبت‌های این کلاس:</strong> ${totalAbs}</div><div><strong>جلسات ثبت‌شده این کلاس:</strong> ${totalMarked}/${totalCols}</div>`;
          out.appendChild(div);
        } else {
          out.innerHTML+='<div class="small">برای این زبان‌آموز در این کلاس جدول حضور/نمره ثبت نشده است.</div>';
        }
      });
      
      out.appendChild(document.createElement('hr')).style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,.1);margin:16px 0';

      out.appendChild(document.createElement('h4')).textContent = 'سابقه پرداخت شهریه (تاریخچه کل)';
      if(st.tuition && st.tuition.length > 0) {
        const tTbl=document.createElement('table');
        const tH=document.createElement('tr');tH.innerHTML='<th>تاریخ</th><th>مبلغ (تومان)</th><th>کلاس ثبت‌شده</th>';tTbl.appendChild(tH);
        st.tuition.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(t => {
          const tr=document.createElement('tr');tr.innerHTML=`<td>${t.date}</td><td>${t.amount.toLocaleString('fa-IR')}</td><td>${classes.find(c => c.id === t.classId)?.name || '-'}</td>`;tTbl.appendChild(tr);
        });
        out.appendChild(tTbl);
      } else {
        out.innerHTML+='<div class="small">سابقه پرداخت شهریه ثبت نشده است.</div>';
      }
      
      out.appendChild(document.createElement('h4')).textContent = 'کتاب‌های گذرانده شده (تاریخچه کل)';
      if(st.books && st.books.length > 0) {
        const bTbl=document.createElement('table');
        const bH=document.createElement('tr');bH.innerHTML='<th>نام کتاب</th><th>تاریخ اتمام</th>';bTbl.appendChild(bH);
        st.books.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(b => {
          const tr=document.createElement('tr');tr.innerHTML=`<td>${b.name}</td><td>${b.date}</td>`;bTbl.appendChild(tr);
        });
        out.appendChild(bTbl);
      } else {
        out.innerHTML+='<div class="small">سابقه کتاب ثبت نشده است.</div>';
      }

      out.appendChild(document.createElement('h4')).textContent = 'صندوق پیام (تذکرات)';
      if(st.messages && st.messages.length > 0) {
        st.messages.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(m => {
          const d = document.createElement('div');
          d.className = 'card small';
          d.style.background = 'rgba(255,100,100,.05)';
          d.style.marginBottom = '6px';
          d.innerHTML = `<strong>${m.sender === 'admin' ? 'مدیر' : 'معلم'}</strong> <span style="float:left">${m.date}</span><p style="margin-top:4px">${m.text}</p>`;
          out.appendChild(d);
        });
      } else {
        out.innerHTML+='<div class="small">صندوق پیام خالی است.</div>';
      }
    }

    // UI navigation
    $('btn-panel').addEventListener('click',()=>{showSection('panel','btn-panel')});
    $('btn-dashboard').addEventListener('click',async ()=>{showSection('dashboard','btn-dashboard');await buildAttendanceTable();}); // Now async
    $('btn-student-view').addEventListener('click',()=>{showSection('student-view','btn-student-view');refreshLists();});

    function showSection(id,btnId){
      ['panel','dashboard','student-view','announcements'].forEach(s=>$(s).style.display = 'none');
      const targetSection = $(id);
      if(targetSection) targetSection.style.display = 'block';

      document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
      if(btnId)$(btnId).classList.add('active');
      refreshLists();
      if (id === 'dashboard') { updateDashboardStudents(); }
    }
    
    // Admin Only features access check (before event listeners)
    const adminButtons = ['delete-class', 'delete-student'];
    adminButtons.forEach(btnId => {
      const btn = $(btnId);
      if(btn) btn.onclick = async (e) => { // Made async
        if (currentRole !== 'admin') { alert('فقط مدیر آموزشگاه می‌تواند این عمل را انجام دهد.'); e.preventDefault(); return; }
        if (btnId === 'delete-class') await deleteClass();
        if (btnId === 'delete-student') await deleteStudent();
      };
    });
    
    const teacherAdminButtons = ['save-grade'];
    teacherAdminButtons.forEach(btnId => {
      const btn = $(btnId);
      if(btn) btn.onclick = async (e) => { // Made async
        if (currentRole !== 'admin' && currentRole !== 'teacher') { alert('فقط مدیر یا معلم می‌تواند این عمل را انجام دهد.'); e.preventDefault(); return; }
        if (btnId === 'save-grade') await saveGrade();
      };
    });

    // events
    $('add-class').addEventListener('click',addClass);
    $('add-student').addEventListener('click',addStudent);
    
    $('save-tuition').addEventListener('click',saveTuition);
    $('save-book').addEventListener('click',saveBook);
    
    $('open-dashboard-quick').addEventListener('click',async ()=>{ 
      $('btn-dashboard').click();
      await buildAttendanceTable(); // Call explicitly to ensure data is loaded/rendered
    });
    $('dashboard-class').addEventListener('change',async () => { // Made async
      await buildAttendanceTable(); 
      updateDashboardStudents(); 
    });
    $('search-show').addEventListener('click',showStudentFromSearch);
    
    $('sv-show').addEventListener('click',studentViewShow);
    
    $('tuition-class').addEventListener('change', () => populateDependentStudentSelect('tuition-class', 'tuition-student-select'));
    $('book-class-select').addEventListener('change', () => populateDependentStudentSelect('book-class-select', 'book-student-select'));

    // ==========================================
    // INITIAL LOAD FUNCTION
    // ==========================================
    async function initialLoad() {
      try {
        // Fetch all data and populate cache (using default values for empty data)
        const [classes, students, attendance, announcements] = await Promise.all([
          fetchData('classes', []),
          fetchData('students', []),
          fetchData('attendance', {}),
          fetchData('announcements', [])
        ]);

        classesCache = classes;
        studentsCache = students;
        attendanceCache = attendance;
        announcementsCache = announcements;
        
        // Now that data is in cache, initialize UI
        refreshLists();
        setCurrentRole('admin');
        
      } catch (error) {
        // Error already alerted by handleFirebaseOperation, just log and halt UI init
        console.log('UI initialization halted due to Firebase error.');
      }
    }

    // Run initial load
    initialLoad();