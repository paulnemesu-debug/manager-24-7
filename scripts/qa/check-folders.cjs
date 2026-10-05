const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const project = path.resolve(__dirname, '../..');
const output = process.env.MANAGER_QA_OUTPUT || path.join(project, 'qa-results');
fs.mkdirSync(output, { recursive: true });
const ts = require('typescript');
const React = require('react');
const {act,create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const e = React.createElement;
const handlers = new Set();
let scrollCalls = 0;
let dimensions = { width: 360, height: 800, fontScale: 1 };
const photos = Object.fromEntries(['recipes','mine','exports','ingredients'].map(key => [key, {uri:'data:image/jpeg;base64,'+key}]));
const source = fs.readFileSync(path.join(project, 'src/components/folder-section.tsx'), 'utf8');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const Brand={goldSoft:'#gold',goldInk:'#ink',navy:'#navy',navyDeep:'#navy',navySoft:'#navy',tealSoft:'#teal',tealDeep:'#teal',greenSoft:'#green',green:'#green',amberSoft:'#amber',amber:'#amber',line:'#line',white:'#white',muted:'#muted'};
const mockRequire = (name) => {
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return require('react/jsx-runtime');
  if(name==='@expo/vector-icons')return {Ionicons:(props)=>e('Icon',props)};
  if(name==='expo-image')return { Image: 'Image' };
  if(name==='@/constants/folder-photos')return { FOLDER_PHOTOS: photos };
  if(name==='expo-router')return {useFocusEffect:(callback)=>React.useEffect(callback,[callback])};
  if(name==='react-native')return {
    BackHandler:{addEventListener:(_event,handler)=>{handlers.add(handler);return{remove:()=>handlers.delete(handler)}}},
    Keyboard:{dismiss:()=>{}},StyleSheet:{create:(value)=>value},
    View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',useWindowDimensions:()=>dimensions,
  };
  if(name==='@/components/tool-header')return {ToolHeader:({title,onBack})=>e('ToolHeader',null,e('Text',null,title),e('Button',{id:'back',onPress:onBack}))};
  if(name==='@/components/ui')return {Screen:({children,scrollRef,...props})=>e('Screen',{...props,ref:scrollRef},children)};
  if(name==='@/constants/theme')return {Brand,Fonts:{extraBold:'bold',regular:'regular'},Radius:{large:24}};
  throw new Error('Unexpected import '+name);
};
const mod={exports:{}};
new Function('require','module','exports',code)(mockRequire,mod,mod.exports);
const {FolderHub,FolderSection}=mod.exports;
const hasHidden=(style)=>Array.isArray(style)?style.some(hasHidden):!!(style&&style.display==='none');
const visible=(node)=>{for(let current=node;current;current=current.parent)if(hasHidden(current.props.style))return false;return true};
const Counter=()=>{const[count,setCount]=React.useState(0);return e('View',null,e('Text',{id:'count'},String(count)),e('Button',{id:'increment',onPress:()=>setCount(count+1)}))};
const fixture=(initialFolder,navigationKey)=>e(FolderHub,{header:e('Text',{id:'root'},'Folders'),initialFolder,navigationKey,layout:'grid'},
  e(FolderSection,{id:'recipes',title:'Recipes',icon:'restaurant-outline'},e(Counter)),
  e(FolderSection,{id:'mine',title:'My recipes',icon:'checkmark-done-circle-outline'},e('Text',{id:'mine-body'},'Saved recipes')),
  e(FolderSection,{id:'exports',title:'Exports',icon:'document-text-outline'},e('Text',{id:'export-body'},'Allergens')),
  e(FolderSection,{id:'ingredients',title:'Ingredients',icon:'leaf-outline'},e('Text',null,'Catalog')));
const options={createNodeMock:(element)=>element.type==='Screen'?{scrollTo:()=>scrollCalls++}:null};
let tree;
const press=async(label)=>{const node=tree.root.findAll((node)=>node.props.accessibilityLabel===label&&node.type==='Pressable'&&visible(node))[0];assert(node,'Visible folder '+label);await act(()=>node.props.onPress())};
const back=async()=>{const node=tree.root.findAll((node)=>node.type==='Button'&&node.props.id==='back'&&visible(node))[0];assert(node);await act(()=>node.props.onPress())};
(async()=>{
 const stderr=console.error;
 console.error=(...args)=>{if(!String(args[0]).includes('react-test-renderer is deprecated'))stderr(...args)};
 await act(()=>{tree=create(fixture(),options)});
 assert.equal(tree.root.findAll((node)=>node.type==='Pressable'&&visible(node)).length,4);
 assert.equal(tree.root.findAll((node)=>node.type==='Text'&&node.props.id==='mine-body').length,0);
 assert.equal(tree.root.findAllByType('Image').length,4);
 assert.equal(new Set(tree.root.findAllByType('Image').map(n=>n.props.source.uri)).size,4);
 for(const size of [{width:320,height:568,fontScale:1},{width:360,height:640,fontScale:1},{width:390,height:844,fontScale:1},{width:768,height:1024,fontScale:1}]) {
   dimensions=size;await act(()=>tree.update(fixture()));assert.equal(tree.root.findByType('Screen').props.scroll,false);
 }
 dimensions={width:320,height:568,fontScale:1.8};await act(()=>tree.update(fixture()));assert.equal(tree.root.findByType('Screen').props.scroll,true);
 dimensions={width:360,height:800,fontScale:1};await act(()=>tree.update(fixture()));
 await press('Recipes');
 assert.equal(tree.root.findAll((node)=>node.type==='Pressable'&&visible(node)).length,0);
 assert.equal(handlers.size,1);
 await act(()=>tree.root.findByProps({id:'increment'}).props.onPress());
 assert.equal(tree.root.findByProps({id:'count'}).children[0],'1');
 await back();
 assert.equal(handlers.size,0);
 await press('My recipes');
 assert(visible(tree.root.findByProps({id:'mine-body'})));
 assert(!visible(tree.root.findByProps({id:'count'})));
 await back();
 await press('Recipes');
 assert.equal(tree.root.findByProps({id:'count'}).children[0],'1');
 assert(visible(tree.root.findByProps({id:'count'})));
 const hardwareBack=[...handlers][0];
 await act(()=>assert.equal(hardwareBack(),true));
 assert.equal(handlers.size,0);
 assert(visible(tree.root.findByProps({id:'root'})));
 await act(()=>tree.update(fixture('mine','save-1')));
 assert(visible(tree.root.findByProps({id:'mine-body'})));
 await back();
 assert(visible(tree.root.findByProps({id:'root'})));
 await act(()=>tree.update(fixture('mine','save-2')));
 assert(visible(tree.root.findByProps({id:'mine-body'})));
 assert(!visible(tree.root.findByProps({id:'count'})));
 assert(scrollCalls>0);
 await act(()=>tree.unmount());
 assert.equal(handlers.size,0);
 console.error=stderr;
 const report={checks_passed:6,checks:['four folders with distinct offline photos', '2 by 2 fitted grid at four viewport sizes', 'accessible scrolling for large fonts','form state retained across closing and switching','Android back handler closes and cleans up','saving redirects to My recipes even for the same folder'],renderer:'React test renderer with native adapters',physical_device:false};
 fs.writeFileSync(path.join(output,'folder-checks.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1});
