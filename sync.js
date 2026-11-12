/* Supabase browser client. Contains only a public publishable key. */
(function (root) {
  'use strict';
  const URL_BASE = 'https://osxcpjhqibprfykmshsk.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_7qYbp4yb7I4k-D-B7caGTw_3g9JNF5W';
  class CloudError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  class Client {
    constructor(fetcher = root.fetch.bind(root), onSession = () => {}) {
      this.fetcher = fetcher; this.onSession = onSession; this.session = null;
      this.refreshing = null;
    }
    setSession(session) {
      this.session = session ? { ...session, expires_at: session.expires_at || Math.floor(Date.now()/1000) + (session.expires_in || 3600) } : null;
      this.onSession(this.session);
    }
    async raw(path, {method = 'GET', body, token, headers = {}} = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await this.fetcher(URL_BASE + path, {
          method, signal: controller.signal,
          headers: {apikey: PUBLIC_KEY, 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {}), ...headers},
          ...(body !== undefined ? {body: JSON.stringify(body)} : {})
        });
        const text = await response.text();
        let result; try { result = text ? JSON.parse(text) : null; } catch { throw new CloudError('Máy chủ trả về dữ liệu không hợp lệ.', 'response'); }
        if (!response.ok) throw new CloudError(result?.msg || result?.message || result?.error_description || 'Không thể kết nối máy chủ.', String(response.status));
        return result;
      } catch (error) {
        if (error instanceof CloudError) throw error;
        throw new CloudError('Không kết nối được Supabase. Kiểm tra Internet rồi thử lại.', 'network');
      } finally { clearTimeout(timer); }
    }
    async signIn(email, password) {
      const result = await this.raw('/auth/v1/token?grant_type=password', {method:'POST', body:{email,password}});
      this.setSession(result); return result;
    }
    async signUp(email, password, redirect) {
      const result = await this.raw('/auth/v1/signup?redirect_to=' + encodeURIComponent(redirect), {method:'POST', body:{email,password}});
      if (result?.access_token) this.setSession(result);
      return result;
    }
    async token() {
      if (!this.session?.access_token) throw new CloudError('Cần đăng nhập.', 'auth');
      if (this.session.expires_at < Date.now()/1000 + 60) {
        if (!this.refreshing) this.refreshing = this.raw('/auth/v1/token?grant_type=refresh_token', {
          method:'POST', body:{refresh_token:this.session.refresh_token}
        }).then(s => this.setSession(s)).finally(() => {this.refreshing = null;});
        await this.refreshing;
      }
      return this.session.access_token;
    }
    async read() {
      const rows = await this.raw('/rest/v1/petct_workspace?id=eq.1&select=id,data,revision,updated_at,updated_by', {token:await this.token()});
      if (!Array.isArray(rows) || rows.length !== 1) throw new CloudError('Tài khoản này chưa có quyền vào nhóm, hoặc chưa tạo dòng workspace id = 1. Kiểm tra email trong petct_members.', 'membership');
      return rows[0];
    }
    async write(data, revision) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw new CloudError('Phiên bản dữ liệu không hợp lệ.', 'revision');
      const rows = await this.raw('/rest/v1/petct_workspace?id=eq.1&revision=eq.' + revision + '&select=id,data,revision,updated_at,updated_by', {
        method:'PATCH', token:await this.token(), body:{data}, headers:{Prefer:'return=representation'}
      });
      if (!Array.isArray(rows) || rows.length !== 1) throw new CloudError('Dữ liệu đã được người khác cập nhật hoặc quyền truy cập đã thay đổi. Bản sửa của bạn chưa được ghi đè lên máy chủ.', 'conflict');
      return rows[0];
    }
    async signOut() {
      try { if(this.session) await this.raw('/auth/v1/logout', {method:'POST', token:this.session.access_token}); }
      finally { this.setSession(null); }
    }
  }
  root.PetctCloud = {Client, CloudError};
})(globalThis);
