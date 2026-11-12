'use strict';
const cloudSessionKey = 'petct-supabase-session-v1';
const cloudClient = new PetctCloud.Client(undefined, session => {
  try { if(session) sessionStorage.setItem(cloudSessionKey, JSON.stringify(session)); else sessionStorage.removeItem(cloudSessionKey); } catch {}
});
const cloudState = {ready:false, busy:false, dirty:false, revision:null, updated:null, error:'', conflict:false, reading:false};
let cloudGeneration = 0;
const baseRender = render;
const baseGo = go;
const cloudBar = document.createElement('div'); cloudBar.id = 'cloud-bar'; document.body.prepend(cloudBar);
function initialState() { return {steps:steps.map(()=>statuses[0]), checks:checks.map(()=>false), datasets:[], papers:[], experiments:[], notes:''}; }
function validState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Dữ liệu nhóm không hợp lệ.');
  if (Object.keys(data).length === 0) return initialState();
  if (!Array.isArray(data.steps) || data.steps.length!==8 || !data.steps.every(s=>statuses.includes(s)) || !Array.isArray(data.checks) || data.checks.length!==checks.length || !data.checks.every(x=>typeof x==='boolean') || typeof data.notes!=='string') throw Error('Cấu trúc tiến độ nhóm không đúng định dạng.');
  for (const k of Object.keys(schemas)) {
    if(!Array.isArray(data[k]) || !data[k].every(r=>r && typeof r==='object' && typeof r.id==='string' && /^[a-zA-Z0-9-]+$/.test(r.id) && Object.values(r).every(v=>typeof v==='string'))) throw Error('Bản ghi nhóm không đúng định dạng.');
  }
  return structuredClone(data);
}
function cloudStatus() {
  const email = cloudClient.session?.user?.email || '';
  let status = cloudState.busy ? 'Đang lưu lên máy chủ…' : cloudState.dirty ? 'Có thay đổi chưa lưu lên máy chủ' : cloudState.ready ? 'Đã đồng bộ · phiên bản ' + cloudState.revision : 'Chưa tải dữ liệu nhóm';
  cloudBar.innerHTML = `<div><strong>PET/CT Lab · Nhóm nghiên cứu</strong><span>${esc(status)}</span>${cloudState.updated&&!cloudState.dirty?`<small>Cập nhật: ${esc(new Date(cloudState.updated).toLocaleString('vi-VN'))}</small>`:''}</div><div><span>${esc(email)}</span>${email?'<button id="logout">Đăng xuất</button>':''}</div>${cloudState.error?`<div class="cloud-error" role="alert">${esc(cloudState.error)}${cloudState.dirty?'<div class="actions"><button id="draft-export">Tải bản sửa chưa lưu</button>'+(cloudState.conflict?'':'<button id="cloud-retry">Thử lưu lại</button>')+'<button id="cloud-discard">Bỏ bản sửa & tải bản chung</button></div>':'<button id="cloud-reload">Thử tải lại</button>'}</div>`:''}`;
  if($('#logout')) $('#logout').onclick = cloudLogout;
  if($('#draft-export')) $('#draft-export').onclick = () => download(JSON.stringify({format:key,data:state},null,2),'petct-unsaved-draft.json','application/json');
  if($('#cloud-retry')) $('#cloud-retry').onclick = cloudSave;
  if($('#cloud-discard')) $('#cloud-discard').onclick = async () => {if(confirm('Bỏ bản sửa chưa lưu trên máy này và tải dữ liệu chung? Hãy tải bản sửa trước nếu cần giữ lại.')) {cloudState.dirty=false;cloudState.conflict=false;cloudState.ready=false;cloudState.error='';await cloudLoad(true);}};
  if($('#cloud-reload')) $('#cloud-reload').onclick = () => cloudLoad(true);
  $('main').inert = !cloudState.ready || cloudState.busy || (cloudState.dirty && !!cloudState.error);
  $('aside').inert = $('main').inert;
  $('#dialog').inert = cloudState.busy;
}
render = function() {
  baseRender();
  if($('#notes')) {
    const hint = $('#notes').nextElementSibling;
    hint.textContent = 'Ghi chú được lưu khi bạn rời ô nhập (nhấn Tab hoặc bấm ra ngoài).';
    $('#notes').oninput = e => {state.notes=e.target.value;cloudState.dirty=true;};
    $('#notes').onchange = () => cloudSave();
  }
  cloudStatus();
};
go = function(p) {if(cloudState.busy || (cloudState.dirty && cloudState.error))return; baseGo(p);};
async function cloudSave() {
  if (!cloudState.ready || cloudState.busy) return;
  cloudState.dirty=true;cloudState.busy=true;cloudState.error='';cloudStatus();
  const snapshot=structuredClone(state);
  try {
    const row=await cloudClient.write(snapshot, cloudState.revision);
    cloudState.revision=row.revision;cloudState.updated=row.updated_at;
    cloudState.dirty=false;cloudState.conflict=false;
    toast('Đã lưu lên máy chủ — cả nhóm có thể thấy thay đổi');
  } catch(error) {
    cloudState.error=error.message;cloudState.conflict=error.code==='conflict';
    toast('Chưa lưu lên máy chủ. Bản sửa vẫn được giữ trong trang này.');
  } finally {cloudState.busy=false;cloudStatus();}
}
async function cloudLoad(force=false) {
  if(!cloudClient.session || cloudState.reading || cloudState.busy || cloudState.dirty)return;
  if(!force && ($('#dialog').open || document.activeElement?.tagName==='TEXTAREA' || document.activeElement?.tagName==='INPUT' || document.activeElement?.tagName==='SELECT'))return;
  cloudState.reading=true;
  const generation=cloudGeneration;
  try {
    const row=await cloudClient.read();
    // An edit may have started while the read request was in flight.
    if(generation!==cloudGeneration || !cloudClient.session || cloudState.dirty || cloudState.busy || (!force && $('#dialog').open))return;
    if(!cloudState.ready || row.revision!==cloudState.revision) {
      state=validState(row.data);cloudState.revision=row.revision;cloudState.updated=row.updated_at;cloudState.ready=true;
      document.body.classList.remove('signed-out');$('#auth-screen')?.remove();
      cloudState.error='';render();
    } else {cloudState.error='';cloudStatus();}
  } catch(error) {
    if(generation!==cloudGeneration)return;
    cloudState.error=error.message;cloudStatus();
    if(!cloudState.ready) authScreen(error.message);
  } finally {cloudState.reading=false;}
}
function authScreen(message='') {
  document.body.classList.add('signed-out');$('#auth-screen')?.remove();
  const screen=document.createElement('section');screen.id='auth-screen';
  screen.innerHTML=`<div class="auth-card"><div class="eyebrow">KHÔNG GIAN LÀM VIỆC CHUNG</div><h1>PET/CT Lab</h1><p>Đăng nhập bằng email đã được thêm vào nhóm. Tiến độ được lưu chung trên Supabase.</p><form id="auth-form"><label for="auth-email">Email thành viên</label><input id="auth-email" type="email" autocomplete="username" required><label for="auth-password">Mật khẩu tài khoản PET/CT Lab</label><input id="auth-password" type="password" autocomplete="current-password" minlength="8" required><div class="actions"><button class="primary" type="submit">Đăng nhập</button><button id="signup" type="button">Tạo tài khoản</button></div></form><p id="auth-message" role="status">${esc(message)}</p><details><summary>Lần đầu sử dụng?</summary><p>Email trong bảng petct_members chỉ cấp quyền vào nhóm, chưa tạo tài khoản đăng nhập. Chọn “Tạo tài khoản”, xác nhận email nếu được yêu cầu, rồi quay lại đăng nhập. Đây là mật khẩu riêng của ứng dụng, không phải mật khẩu tài khoản quản trị Supabase.</p></details><p class="subtle">Dữ liệu trong bản HTML cũ không tự đưa lên mạng. Sau khi đăng nhập, dùng Nhập bản sao lưu JSON để chuyển tiến độ cũ.</p></div>`;
  document.body.append(screen);$('#auth-email').value=cloudClient.session?.user?.email||'';
  $('#auth-form').onsubmit=e=>{e.preventDefault();authenticate(false);};
  $('#signup').onclick=()=>{if($('#auth-form').reportValidity())authenticate(true);};
  cloudStatus();
}
async function authenticate(signUp) {
  cloudGeneration++;
  const email=$('#auth-email').value.trim().toLowerCase(), password=$('#auth-password').value;
  $('#auth-form').inert=true;$('#auth-message').textContent='Đang kết nối…';
  try {
    if(signUp) {
      const result=await cloudClient.signUp(email,password,location.origin+location.pathname);
      $('#auth-password').value='';
      if(!result.access_token) {$('#auth-message').textContent='Nếu email hợp lệ để đăng ký, hãy kiểm tra hộp thư để xác nhận tài khoản rồi quay lại đăng nhập. Nếu bạn đã đăng ký, dùng nút Đăng nhập.';return;}
    } else {await cloudClient.signIn(email,password);$('#auth-password').value='';}
    await cloudLoad(true);
  } catch(error) {$('#auth-message').textContent=error.code==='400'?'Không đăng nhập/đăng ký được: '+error.message:error.message;}
  finally {if($('#auth-form'))$('#auth-form').inert=false;}
}
async function cloudLogout() {
  if(cloudState.busy)return;
  if(cloudState.dirty&&!confirm('Bạn có bản sửa chưa lưu. Đăng xuất sẽ bỏ bản sửa này. Tiếp tục?'))return;
  cloudGeneration++;
  try{await cloudClient.signOut();}catch{}
  cloudState.ready=false;cloudState.dirty=false;cloudState.error='';cloudState.revision=null;
  state=initialState();$('#dialog').close();baseRender();authScreen();
}
window.addEventListener('beforeunload',event=>{if(cloudState.dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>cloudLoad(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)cloudLoad();});
setInterval(()=>{if(!document.hidden)cloudLoad();},5000);
(async()=>{
  // Email confirmation can redirect with session tokens. Do not retain them in the URL.
  if(/(?:access_token|refresh_token)=/.test(location.hash)) history.replaceState(null,'',location.pathname+location.search);
  state=initialState();
  try{const s=JSON.parse(sessionStorage.getItem(cloudSessionKey));if(s?.access_token&&s?.refresh_token)cloudClient.setSession(s);}catch{}
  authScreen();if(cloudClient.session)await cloudLoad(true);
})();
