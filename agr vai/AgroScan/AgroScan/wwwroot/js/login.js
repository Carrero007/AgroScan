
    /* ── Partículas ── */
    (function(){
      const c = document.getElementById('pts');
      for(let i = 0; i < 14; i++){
        const p = document.createElement('div');
        p.className = 'particle';
        const sz  = 2.5 + Math.random() * 7,
              l   = 5 + Math.random() * 90,
              d   = 24 + Math.random() * 32,
              del = Math.random() * -32,
              dr  = (Math.random() - .5) * 100;
        p.style.cssText = `width:${sz}px;height:${sz}px;left:${l}%;bottom:-10%;--drift:${dr}px;animation-duration:${d}s;animation-delay:${del}s`;
        c.appendChild(p);
      }
    })();

    /* ── Parallax vídeo suave ── */
    let tx = 0, ty = 0, cx = 0, cy = 0;
    document.addEventListener('mousemove', e => {
      tx = (e.clientX / innerWidth  - .5) * 9;
      ty = (e.clientY / innerHeight - .5) * 6;
    });
    (function loop(){
      cx += (tx - cx) * .035;
      cy += (ty - cy) * .035;
      const v = document.querySelector('#vbg video');
      if(v) v.style.transform = `translate(calc(-50% + ${cx * .26}px), calc(-50% + ${cy * .26}px)) scale(1.06)`;
      requestAnimationFrame(loop);
    })();

    /* velocidade de reprodução mais lenta para efeito cinematográfico */
    document.getElementById('bgv').addEventListener('loadedmetadata', function(){
      this.playbackRate = 0.60;
    });

    /* ── State machine com animação aprimorada ── */
    const panel   = document.getElementById('panel');
    const fwrap   = document.getElementById('form-wrap');
    const psLogin = document.getElementById('ps-login');
    const psCad   = document.getElementById('ps-cad');
    let state  = 'login';
    let busy   = false;
    let timers = [];

    const DUR     = 700;
    const EXPAND  = 580;
    const HOLD    = 50;
    const CONTENT = 180;

    function tick(ms, fn){ const id = setTimeout(fn, ms); timers.push(id); return id; }
    function flush(){ timers.forEach(clearTimeout); timers = []; }
    function noTrans(fn){
      panel.classList.add('no-transition');
      fn();
      void panel.offsetWidth;
      panel.classList.remove('no-transition');
    }

    function switchTo(target){
      if(target === state || busy) return;
      busy = true; flush();

      /* 1. oculta conteúdo */
      panel.classList.add('expanding');
      fwrap.classList.add('switching');

      /* 2. expande painel full */
      panel.classList.remove('state-left', 'state-right');
      panel.classList.add('state-full');

      tick(EXPAND + HOLD, () => {
        /* 3. snap para lado oposto sem transição */
        noTrans(() => {
          panel.classList.remove('state-full');
          panel.classList.add(target === 'cadastro' ? 'state-right' : 'state-left');
        });

        /* 4. atualiza estado */
        document.body.className = target === 'cadastro' ? 'state-cadastro' : 'state-login';
        document.title = target === 'cadastro' ? 'AgroScan · Criar Conta' : 'AgroScan · Entrar';
        state = target;

        /* 5. exibe form na nova posição */
        tick(55, () => { fwrap.classList.remove('switching'); });

        /* 6. contrai painel + troca slide */
        tick(CONTENT, () => {
          panel.classList.remove('expanding');
          if(target === 'cadastro'){
            psLogin.classList.add('hidden');
            psCad.classList.remove('hidden');
          } else {
            psCad.classList.add('hidden');
            psLogin.classList.remove('hidden');
          }
          tick(DUR, () => { busy = false; });
        });
      });
    }

    /* ── Máscaras ── */
    function maskCpf(el){
      el.addEventListener('input', function(){
        let v = this.value.replace(/\D/g, '');
        if(v.length > 3)  v = v.slice(0,3) + '.' + v.slice(3);
        if(v.length > 7)  v = v.slice(0,7) + '.' + v.slice(7);
        if(v.length > 11) v = v.slice(0,11) + '-' + v.slice(11);
        this.value = v.slice(0,14);
      });
    }
    maskCpf(document.getElementById('loginCpf'));
    maskCpf(document.getElementById('cadCpf'));

    document.getElementById('cadWhats').addEventListener('input', function(){
      let v = this.value.replace(/\D/g, '');
      if(v.length > 2)  v = '(' + v.slice(0,2) + ') ' + v.slice(2);
      if(v.length > 10) v = v.slice(0,10) + '-' + v.slice(10);
      this.value = v.slice(0,15);
    });

    document.getElementById('loginSenha').addEventListener('keydown', e => {
      if(e.key === 'Enter') fazerLogin();
    });

    /* ── Login ── */
    async function fazerLogin(){
      const cpf   = document.getElementById('loginCpf').value.replace(/\D/g,'');
      const senha = document.getElementById('loginSenha').value;
      const btn   = document.getElementById('btnLogin');
      const al    = document.getElementById('alLogin');
      al.className = 'alert';
      if(!cpf || !senha){ al.className='alert erro'; al.textContent='Preencha CPF e senha.'; return; }
      btn.classList.add('loading'); btn.disabled = true;
      try{
        const r = await fetch('/api/auth/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cpf,senha}) });
        const d = await r.json();
        if(!r.ok){ al.className='alert erro'; al.textContent = d.erro || 'CPF ou senha inválidos.'; return; }
        localStorage.setItem('as_token',   d.token);
        localStorage.setItem('as_refresh', d.refreshToken);
        localStorage.setItem('as_nome',    d.nome);
        localStorage.setItem('as_uid',     d.usuarioId);
        localStorage.setItem('as_exp',     d.expiracao);
        window.location.replace('dashboard.html');
      } catch {
        al.className='alert erro'; al.textContent='Falha de conexão. Tente novamente.';
      } finally {
        btn.classList.remove('loading'); btn.disabled = false;
      }
    }

    /* ── Cadastro ── */
    async function cadastrar(){
      const btn  = document.getElementById('btnCad');
      const al   = document.getElementById('alCad');
      al.className = 'alert';
      const nome  = document.getElementById('cadNome').value.trim();
      const cpf   = document.getElementById('cadCpf').value.replace(/\D/g,'');
      const senha = document.getElementById('cadSenha').value;
      const area  = document.getElementById('cadArea').value;
      const tipo  = document.getElementById('cadTipo').value;
      const whats = document.getElementById('cadWhats').value.replace(/\D/g,'');
      if(!nome  || nome.length < 3)  { al.className='alert erro'; al.textContent='Nome muito curto (mínimo 3 caracteres).'; return; }
      if(cpf.length !== 11)          { al.className='alert erro'; al.textContent='CPF inválido. Digite os 11 dígitos.'; return; }
      if(!senha || senha.length < 6) { al.className='alert erro'; al.textContent='Senha muito curta (mínimo 6 caracteres).'; return; }
      btn.classList.add('loading'); btn.disabled = true;
      try{
        const body = {nome, cpf, senha};
        if(tipo)  body.tipoProdutor  = tipo;
        if(area)  body.areaHectares  = parseFloat(area);
        if(whats) body.whatsapp      = whats;
        const r = await fetch('/api/auth/cadastrar',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const d = await r.json();
        if(!r.ok){ al.className='alert erro'; al.textContent = d.erro || 'Erro ao cadastrar. Tente novamente.'; return; }
        al.className='alert ok'; al.textContent='✓ Conta criada! Redirecionando para o login...';
        setTimeout(() => switchTo('login'), 1600);
      } catch {
        al.className='alert erro'; al.textContent='Falha de conexão. Tente novamente.';
      } finally {
        btn.classList.remove('loading'); btn.disabled = false;
      }
    }

window.switchTo = switchTo;
window.fazerLogin = fazerLogin;
window.cadastrar = cadastrar;