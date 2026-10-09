// Issue one native recovery token for an existing account; never print it.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require=createRequire('/opt/coffee-passport/app/package.json');
const { createClient }=require('@supabase/supabase-js');
const email=process.argv[2];
if(!email||!email.includes('@'))throw Error('Existing account email required');
const env=Object.fromEntries(readFileSync('/opt/coffee-passport/app/.env.local','utf8').split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
function query(sql){return JSON.parse(execFileSync('docker',['exec','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{stdio:['ignore','pipe','pipe']}).toString())}
function state(){
  const auth=query("SELECT json_agg(x ORDER BY id) FROM (SELECT id,role,encrypted_password,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at FROM auth.users)x");
  const tables=query("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'");
  const app={};
  for(const table of tables){app[table]=query(`SELECT to_json(md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public."${table}" t)s`)}
  return {auth,app};
}
let stage='snapshot';
try{
  const before=state();
  const user=before.auth.filter(x=>x.email?.toLowerCase()===email.toLowerCase());
  if(user.length!==1)throw Error('Exactly one existing user required');
  const site=new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
  stage='page';
  if((await fetch(site+'/auth/reset-password')).status!==200)throw Error('Recovery page unavailable');
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  stage='generate';
  const {data,error}=await client.auth.admin.generateLink({type:'recovery',email});
  if(error||!data.properties?.hashed_token||data.user?.id!==user[0].id)throw Error('Recovery generation failed');
  stage='preservation';
  if(JSON.stringify(before)!==JSON.stringify(state()))throw Error('Account metadata/passwords/application data changed');
  stage='private_file';
  const path='/root/coffee-passport-recovery';mkdirSync(path,{mode:0o700,recursive:true});
  const link=site+'/auth/reset-password#token_hash='+encodeURIComponent(data.properties.hashed_token);
  const html='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Coffee Passport — новый пароль</title><p>Открываем защищённую страницу установки пароля…</p><script>location.replace('+JSON.stringify(link)+')</script></html>';
  writeFileSync(path+'/open-recovery.html',html,{mode:0o600});
  writeFileSync(path+'/receipt.json',JSON.stringify({native_recovery_issued:true,existing_uuid_preserved:true,passwords_unchanged:true,roles_metadata_unchanged:true,application_data_unchanged:true,created_at:new Date().toISOString()},null,2),{mode:0o600});
  console.log('NATIVE_RECOVERY_READY; UUID_ROLES_PASSWORDS_AND_APPLICATION_DATA_PRESERVED');
}catch{console.error('RECOVERY_PREPARATION_FAILED',stage,'private details suppressed');process.exitCode=1}
