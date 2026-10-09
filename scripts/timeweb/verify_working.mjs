// HTTPS integration acceptance. Tokens and personal data are never printed.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const require = createRequire('/opt/coffee-passport/app/package.json');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const env = Object.fromEntries(readFileSync('/opt/coffee-passport/app/.env.local','utf8').split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const url=env.NEXT_PUBLIC_SUPABASE_URL, site=new URL(url).origin;
const password=readFileSync('/opt/coffee-passport/app/lib/auth/pilotStaff.ts','utf8').match(/PILOT_STAFF_PASSWORD = '([^']+)'/)[1];
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,opts);
const anon=createClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
const results={};
function check(name,ok){results[name]=Boolean(ok);console.log('CHECK',name,Boolean(ok));if(!ok)throw Error('Acceptance failed: '+name)}
let probeUser, checkin;
try {
  for (const [role,email,path] of [['cafe_admin','cafe@test.com','/dashboard/cafe'],['roaster_admin','roaster@test.com','/dashboard/roaster'],['barista','barista@test.com','/dashboard/barista'],['admin','admin@test.com','/dashboard/admin']]) {
    const jar=new Map();
    const client=createServerClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});
    const login=await client.auth.signInWithPassword({email,password});
    check('login_'+role,!login.error&&login.data.user?.id);
    const user=await client.auth.getUser();check('user_'+role,!user.error&&user.data.user.id===login.data.user.id);
    const refresh=await client.auth.refreshSession();check('refresh_'+role,!refresh.error&&refresh.data.user.id===user.data.user.id);
    const profile=await client.from('profiles').select('id,role').eq('id',user.data.user.id).single();check('profile_'+role,!profile.error&&profile.data.role===role);
    const cookie=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
    const response=await fetch(site+path,{headers:{Cookie:cookie},redirect:'manual'});
    const html=await response.text();
    check('dashboard_'+role,response.status===200&&!html.includes('NEXT_REDIRECT')&&!html.includes('NEXT_HTTP_ERROR_FALLBACK'));
    if(role==='cafe_admin'){
      const wrong=await fetch(site+'/dashboard/admin',{headers:{Cookie:cookie},redirect:'manual'});
      const body=await wrong.text();check('wrong_role_dashboard_denied',wrong.status===307||body.includes('NEXT_REDIRECT'));
    }
    await client.auth.signOut();
  }
  const bad=await anon.auth.signInWithPassword({email:'cafe@test.com',password:'invalid-migration-probe'});check('bad_password_denied',Boolean(bad.error));
  const privateRead=await anon.from('partner_requests').select('id');check('anonymous_private_read_denied',privateRead.error||privateRead.data.length===0);
  const promote=await anon.from('profiles').insert({id:randomUUID(),role:'admin'});check('anonymous_promotion_denied',Boolean(promote.error));
  for(const table of ['coffee_shops','roasters','lots','coffees','green_lots','reference_taste_profiles','reference_roast_profiles','checkins_community_view']){
    const response=await anon.from(table).select('*').limit(3);check('public_api_'+table,!response.error&&Array.isArray(response.data));
  }
  for(const path of ['/','/auth/login','/map','/journey','/recipes','/top-recipes','/loyalty','/coffee-kitchen','/scan']){
    const response=await fetch(site+path);check('page_'+path,response.status===200);
  }
  const lots=await anon.from('lots').select('public_id').limit(1);
  if(lots.data?.length){const response=await fetch(site+'/passport/'+encodeURIComponent(lots.data[0].public_id));check('public_passport_http',response.status===200)}
  const unauthorized=await fetch(site+'/dashboard/cafe',{redirect:'manual'});const body=await unauthorized.text();check('anonymous_dashboard_denied',unauthorized.status===307||body.includes('NEXT_REDIRECT'));
  for(const path of ['/api/admin/partner-requests','/api/roaster/production','/api/cafe/roastery-orders']){const response=await fetch(site+path);check('unauthorized_'+path,[401,403].includes(response.status));}
  const probe=createClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
  const signup=await probe.auth.signUp({email:'migration-'+randomUUID()+'@example.com',password:randomUUID()+'Aa1!'});
  probeUser=signup.data.user?.id;check('signup_autoconfirm',!signup.error&&probeUser&&signup.data.session);
  const profile=await probe.from('profiles').select('id,role').eq('id',probeUser).single();check('signup_profile_trigger',!profile.error&&profile.data.role==='enthusiast');
  const userId=randomUUID(); // A forged owner must fail RLS.
  const forged=await probe.from('checkins').insert({id:randomUUID(),owner_user_id:userId,lot_id:'migration-probe',roaster_id:'migration-probe',coffee_shop_id:'migration-probe',brewing_method:'espresso',rating:5,acidity:5,sweetness:5,body:5,bitterness:5});
  check('forged_checkin_owner_denied',Boolean(forged.error));
  checkin=randomUUID();
  const insert=await probe.from('checkins').insert({id:checkin,owner_user_id:probeUser,lot_id:'migration-probe',roaster_id:'migration-probe',coffee_shop_id:'migration-probe',brewing_method:'espresso',rating:5,acidity:5,sweetness:5,body:5,bitterness:5,is_public:false}).select('id').single();
  check('own_tasting_write',!insert.error&&insert.data.id===checkin);
  const own=await probe.from('checkins').select('id').eq('id',checkin);check('own_tasting_read',!own.error&&own.data.length===1);
  const guest=await anon.from('checkins').select('id').eq('id',checkin);check('private_tasting_hidden',guest.error||guest.data.length===0);
} finally {
  if(checkin){const removed=await admin.from('checkins').delete().eq('id',checkin);results.probe_checkin_cleanup=!removed.error;}
  if(probeUser){const removed=await admin.auth.admin.deleteUser(probeUser);results.probe_user_cleanup=!removed.error;}
  const failures=Object.entries(results).filter(([,ok])=>!ok).map(([name])=>name);
  writeFileSync(process.argv[2],JSON.stringify({results,failures,visual_browser_tested:false},null,2),{mode:0o600});
  if(failures.length)process.exitCode=1;
}
