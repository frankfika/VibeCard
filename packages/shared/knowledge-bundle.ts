import type { ArchiveAppInfo, ArchiveKnowledgeSource } from './archive';
import { canonicalJson, fnv1a32 } from './archive';
import { externalKnowledgeAdapter, fileKnowledgeAdapter, linkKnowledgeAdapter, noteKnowledgeAdapter } from './knowledge';
import type { KnowledgeChunk, KnowledgeSourceKind } from './knowledge';
import type { MemoryVisibility } from './vibe';
import { isMemoryVisibility } from './memory';

export const KNOWLEDGE_BUNDLE_FORMAT = 'vibecard-knowledge-bundle';
export const KNOWLEDGE_BUNDLE_SCHEMA_VERSION = 1;
export const KNOWLEDGE_BUNDLE_MAX_SOURCE_BYTES = 10_000_000;
export const KNOWLEDGE_BUNDLE_MAX_TOTAL_BYTES = 10_000_000;
export const KNOWLEDGE_BUNDLE_MAX_SOURCES = 1_000;

export interface CanonicalKnowledgeSource extends ArchiveKnowledgeSource { content: string; visibility: MemoryVisibility; adapterKind: KnowledgeSourceKind }
export interface PortableKnowledgeSource extends Omit<CanonicalKnowledgeSource, 'content'> { contentEncoding: 'base64-utf8'; contentBase64: string; contentDigest: string }
export interface PortableKnowledgeBundle { format: typeof KNOWLEDGE_BUNDLE_FORMAT; schemaVersion: 1; createdAt: number; ownerId: string; app: ArchiveAppInfo; sources: PortableKnowledgeSource[]; integrity: { algorithm: 'fnv1a-32'; digest: string } }
export interface ImportedKnowledgeBundle { bundle: PortableKnowledgeBundle; sources: CanonicalKnowledgeSource[]; chunks: KnowledgeChunk[] }
export type KnowledgeBundleErrorCode = 'invalid_shape' | 'unsupported_version' | 'future_version' | 'checksum_mismatch' | 'owner_mismatch';
export type KnowledgeBundleResult<T> = { ok: true; value: T } | { ok: false; error: { code: KnowledgeBundleErrorCode; message: string } };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SOURCE_KEYS = ['adapterKind','contentBase64','contentDigest','contentEncoding','createdAt','id','kind','ownerId','schemaVersion','source','status','title','updatedAt','visibility'];
const TOP_KEYS = ['app','createdAt','format','integrity','ownerId','schemaVersion','sources'];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const string = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function encodeBase64(bytes:Uint8Array):string{const parts:string[]=[];const size=48*1024;for(let start=0;start<bytes.length;start+=size){const slice=bytes.subarray(start,Math.min(bytes.length,start+size));let binary='';for(let i=0;i<slice.length;i++)binary+=String.fromCharCode(slice[i]!);parts.push(btoa(binary))}return parts.join('')}
function base64Length(value:string):number|null{if(value.length%4!==0)return null;let padding=0;if(value.endsWith('=='))padding=2;else if(value.endsWith('='))padding=1;const dataEnd=value.length-padding;for(let i=0;i<value.length;i++){const char=value[i]!;if(i>=dataEnd){if(char!=='=')return null}else if(ALPHABET.indexOf(char)<0)return null}return(value.length/4)*3-padding}
function decodeBase64(value:string,length:number):Uint8Array|null{const out=new Uint8Array(length);let offset=0;const size=64*1024;try{for(let start=0;start<value.length;start+=size){const binary=atob(value.slice(start,Math.min(value.length,start+size)));for(let i=0;i<binary.length;i++)out[offset++]=binary.charCodeAt(i)}}catch{return null}return offset===length?out:null}
const adapterFor=(kind:KnowledgeSourceKind)=>kind==='file'?fileKnowledgeAdapter:kind==='url'?linkKnowledgeAdapter:kind==='external'?externalKnowledgeAdapter:noteKnowledgeAdapter;

export function exportKnowledgeBundle(input:{ownerId:string;sources:readonly CanonicalKnowledgeSource[];app:ArchiveAppInfo;createdAt:number}):PortableKnowledgeBundle{
  const sources=input.sources.map(({content,...source})=>{const bytes=new TextEncoder().encode(content);return{...source,contentEncoding:'base64-utf8' as const,contentBase64:encodeBase64(bytes),contentDigest:fnv1a32(content)}});
  return{format:KNOWLEDGE_BUNDLE_FORMAT,schemaVersion:1,createdAt:input.createdAt,ownerId:input.ownerId,app:{...input.app},sources,integrity:{algorithm:'fnv1a-32',digest:fnv1a32(canonicalJson({ownerId:input.ownerId,sources}))}};
}

export function importKnowledgeBundle(input:unknown,expectedOwnerId?:string):KnowledgeBundleResult<ImportedKnowledgeBundle>{
  const fail=(code:KnowledgeBundleErrorCode,message:string):KnowledgeBundleResult<ImportedKnowledgeBundle>=>({ok:false,error:{code,message}});
  if(!isRecord(input)||input.format!==KNOWLEDGE_BUNDLE_FORMAT)return fail('invalid_shape','not a VibeCard knowledge bundle');
  if(typeof input.schemaVersion!=='number'||!Number.isSafeInteger(input.schemaVersion))return fail('invalid_shape','invalid knowledge bundle version');
  if(input.schemaVersion>1)return fail('future_version','knowledge bundle was created by a newer VibeCard');if(input.schemaVersion!==1)return fail('unsupported_version','unsupported knowledge bundle version');
  if(!exact(input,TOP_KEYS)||!time(input.createdAt)||!string(input.ownerId)||!isRecord(input.app)||!exact(input.app,['name','version'])||!string(input.app.name)||!string(input.app.version)||!Array.isArray(input.sources)||input.sources.length>KNOWLEDGE_BUNDLE_MAX_SOURCES||!isRecord(input.integrity)||!exact(input.integrity,['algorithm','digest'])||input.integrity.algorithm!=='fnv1a-32'||typeof input.integrity.digest!=='string')return fail('invalid_shape','knowledge bundle shape is invalid');
  const bundle=input as unknown as PortableKnowledgeBundle;if(expectedOwnerId!==undefined&&bundle.ownerId!==expectedOwnerId)return fail('owner_mismatch','knowledge bundle belongs to another owner');
  if(bundle.integrity.digest!==fnv1a32(canonicalJson({ownerId:bundle.ownerId,sources:bundle.sources})))return fail('checksum_mismatch','knowledge bundle integrity check failed');
  const ids=new Set<string>();let total=0;const sources:CanonicalKnowledgeSource[]=[];const chunks:KnowledgeChunk[]=[];
  for(const source of bundle.sources){
    if(!isRecord(source)||!exact(source,SOURCE_KEYS)||!string(source.id)||source.schemaVersion!==1||!string(source.ownerId)||source.ownerId!==bundle.ownerId||ids.has(source.id)||!['file','url','note'].includes(source.kind)||!string(source.title)||source.title.length>500||typeof source.source!=='string'||source.source.length>2_000||!['pending','ingested','failed'].includes(source.status)||!time(source.createdAt)||!time(source.updatedAt)||!['file','url','note','external'].includes(source.adapterKind)||!isMemoryVisibility(source.visibility)||source.contentEncoding!=='base64-utf8'||typeof source.contentBase64!=='string'||typeof source.contentDigest!=='string')return fail(source.ownerId!==bundle.ownerId?'owner_mismatch':'invalid_shape','knowledge source is invalid');
    const decodedLength=base64Length(source.contentBase64);if(decodedLength===null)return fail('invalid_shape','knowledge content encoding is invalid');total+=decodedLength;if(decodedLength>KNOWLEDGE_BUNDLE_MAX_SOURCE_BYTES||total>KNOWLEDGE_BUNDLE_MAX_TOTAL_BYTES)return fail('invalid_shape','knowledge source content exceeds the portable plan limit');const bytes=decodeBase64(source.contentBase64,decodedLength);if(!bytes)return fail('invalid_shape','knowledge content encoding is invalid');
    let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return fail('invalid_shape','knowledge source is not valid UTF-8')}if(fnv1a32(content)!==source.contentDigest)return fail('checksum_mismatch','knowledge source content digest failed');
    const{contentEncoding:_e,contentBase64:_b,contentDigest:_d,...metadata}=source;const canonical={...metadata,content};sources.push(canonical);ids.add(source.id);
    const ingested=adapterFor(source.adapterKind).ingest({ownerId:bundle.ownerId,title:source.title,locator:source.source,content,visibility:source.visibility},source.createdAt,{sourceId:source.id,chunkId:index=>`${source.id}:chunk:${index}`});chunks.push(...ingested.chunks);
  }
  return{ok:true,value:{bundle,sources,chunks}};
}
