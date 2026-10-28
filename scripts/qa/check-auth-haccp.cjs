const { resolveSourceName, sourceFile, evaluateSource } = require('./source-loader.cjs');
// Actual React components and persistence, with explicit native/service adapters.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const React = require('react');
const {act,create} = require('react-test-renderer');
const project = path.resolve(__dirname, '../..');
const output = process.env.MANAGER_QA_OUTPUT || path.join(project,'qa-results');
fs.mkdirSync(output,{recursive:true});
global.IS_REACT_ACT_ENVIRONMENT = true;
const e=React.createElement, cache=new Map(), storage=new Map(), routes=[], alerts=[], sent=[], verified=[];
let verifyFailure=false, favoriteFailure=false, userId='qa-a';
const auth={isAuthenticated:false,isLoading:false,
  requestAccess:async email=>sent.push(email),
  verifyCode:async(email,code)=>{verified.push({email,code});if(verifyFailure)throw Error('Token has expired or is invalid');}};
const router={replace:route=>routes.push(route)};
const widgets=new Proxy({}, {get:(_,name)=>props=>e(String(name),props,props.children)});
function load(name, importer) {
  name = resolveSourceName(name, importer, project);
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return require('react/jsx-runtime');
  if(name==='react-native')return {View:'View',Text:'Text',Pressable:'Pressable',
    Platform:{OS:'android',select:options=>options.android??options.default},
    StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:360,height:800,fontScale:1}),
    AppState:{addEventListener:()=>({remove(){}})},Alert:{alert:(...args)=>alerts.push(args)}};
  if(name==='@expo/vector-icons')return {Ionicons:props=>e('Icon',props)};
  if(name==='expo-constants')return {__esModule:true,default:{expoConfig:{version:'1.5.3'}}};
  if(name==='expo-router')return {useRouter:()=>router};
  if(name==='@/contexts/auth-context')return {useAuth:()=>auth};
  if(name==='@/contexts/locale-context')return {useI18n:()=>({locale:'ro',t:key=>key})};
  if(name.startsWith('@/components/') && name!=='@/components/haccp-form-browser')return widgets;
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{
    getItem:async key=>storage.get(key)??null,
    setItem:async(key,value)=>{if(favoriteFailure)throw Error('storage-full');storage.set(key,value)},
    removeItem:async key=>storage.delete(key)}};
  if (name.startsWith('@/') && name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(project, 'src', name.slice(2)), 'utf8'));
  if (name.startsWith('@/')) return evaluateSource(sourceFile(path.join(project, 'src', name.slice(2))), load, cache);
  throw Error('Unexpected import '+name);
}
const SignIn=load('@/app/sign-in').default;
const {HaccpFormBrowser}=load('@/components/haccp-form-browser');
const {useHaccpFavorites}=load('@/hooks/use-haccp-favorites');
const {HACCP_FORMS}=load('@/constants/haccp-forms');
const {loadHaccpFavorites}=load('@/lib/haccp-favorites');
const checks=[];
let tree;
const find=(type,predicate=()=>true)=>tree.root.findAll(n=>n.type===type&&predicate(n));
const button=label=>find('AppButton',n=>n.props.label===label)[0];
const press=async node=>{assert(node);await act(async()=>node.props.onPress())};
function FormPage(){const favorites=useHaccpFavorites(userId);return e(HaccpFormBrowser,{
  locale:'ro',documents:[],favorites:favorites.codes,ready:favorites.ready,toggleFavorite:favorites.toggle,openForm:code=>routes.push(code)});}
(async()=>{
  const original=console.error;console.error=(...args)=>{if(!String(args[0]).includes('react-test-renderer is deprecated'))original(...args)};
  await act(async()=>{tree=create(e(SignIn))});
  await act(async()=>find('Field')[0].props.onChangeText('invalid'));
  await press(button('signIn.sendCode'));assert.equal(sent.length,0);
  assert(find('Text',n=>n.children.includes('signIn.invalidEmailBody')).length);
  checks.push('invalid registration email is rejected before service invocation');
  await act(async()=>find('Field')[0].props.onChangeText(' QA@EXAMPLE.TEST '));
  await press(button('signIn.sendCode'));assert.deepEqual(sent,['qa@example.test']);
  assert.equal(find('OtpInput').length,1);assert.equal(button('signIn.verify').props.disabled,true);
  checks.push('valid email is normalized, sends one request and opens OTP entry');
  const resend=find('AppButton',n=>n.props.label==='signIn.resendIn')[0];assert(resend.props.disabled);
  await press(resend);assert.equal(sent.length,1);
  checks.push('OTP cooldown prevents repeated service requests');
  await act(async()=>find('OtpInput')[0].props.onChange('123456'));verifyFailure=true;
  await press(button('signIn.verify'));assert.equal(routes.length,0);assert.equal(find('OtpInput')[0].props.value,'');
  checks.push('invalid or expired OTP retains the email and allows another attempt');
  verifyFailure=false;await act(async()=>find('OtpInput')[0].props.onChange('123456'));
  await press(button('signIn.verify'));assert.equal(routes.at(-1),'/');
  checks.push('successful OTP verification routes through the main access gate');
  await act(async()=>tree.unmount());routes.length=0;
  await act(async()=>{tree=create(e(FormPage))});
  const stars=()=>find('Pressable',n=>n.props.accessibilityRole==='checkbox');
  assert.equal(stars().length,6);assert(stars().every(n=>!n.props.disabled));
  await press(stars()[0]);assert.equal(routes.length,0);assert.equal((await loadHaccpFavorites('qa-a')).length,1);
  checks.push('HACCP star toggles persist independently without opening the form');
  await act(async()=>find('ChoiceRow')[0].props.onChange('favorites'));assert.equal(stars().length,1);
  await act(async()=>tree.unmount());await act(async()=>{tree=create(e(FormPage))});
  assert(stars()[0].props.accessibilityState.checked);
  checks.push('favorite selection survives reopening the HACCP screen');
  userId='qa-b';await act(async()=>tree.update(e(FormPage)));assert(stars().every(n=>!n.props.accessibilityState.checked));
  checks.push('switching accounts hides the previous account favorites');
  favoriteFailure=true;await press(stars()[0]);assert.equal((await loadHaccpFavorites('qa-b')).length,0);assert(alerts.length);
  assert(!stars()[0].props.disabled);favoriteFailure=false;
  checks.push('favorite persistence failure retains the previous state and re-enables selection');
  await act(async()=>find('Field')[0].props.onChangeText('imposibil-qa'));assert.equal(stars().length,0);
  await act(async()=>find('Field')[0].props.onChangeText('igiena'));assert(stars().length>0);
  checks.push('HACCP search handles no results and Romanian diacritics');
  await act(async()=>find('Field')[0].props.onChangeText(''));
  const seen=new Set();
  for(let page=0;page<Math.ceil(HACCP_FORMS.length/6);page++){
    for(const node of find('Pressable',n=>n.props.accessibilityRole==='button')){await press(node);seen.add(routes.at(-1));}
    const next=button('Înainte');if(next&&!next.props.disabled)await press(next);
  }
  assert.equal(seen.size,HACCP_FORMS.length);
  checks.push('every HACCP form remains reachable across paginated results');
  await act(async()=>tree.unmount());console.error=original;
  const result={checks_passed:checks.length,checks,haccp_forms_reachable:seen.size,renderer:'Actual sign-in, HACCP browser and favorites hook',service_adapters:true,otp_email_sent:false,physical_device:false};
  fs.writeFileSync(path.join(output,'auth-haccp-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1});
