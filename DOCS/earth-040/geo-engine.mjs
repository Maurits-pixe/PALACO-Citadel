"use strict";
/* EARTH-043 — dependency-free, fail-closed read-only GeoJSON adapter.
   Demo geometries are not authoritative coastline data. */
export const ALLOWED_IDS=Object.freeze(["north-america","south-america","europe","africa","asia","oceania"]);
const fail=message=>{throw new Error("EARTH-043: "+message)};
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;
export function validateCollection(collection){
 if(!collection||collection.type!=="FeatureCollection"||!Array.isArray(collection.features))fail("invalid collection");
 if(collection.features.length!==6)fail("expected six regions");
 if(collection.metadata?.status!=="ILLUSTRATIVE_ONLY"||collection.metadata?.geographicAccuracy!=="NOT_VERIFIED")fail("unverified source metadata");
 const seen=new Set();
 for(const f of collection.features){
  if(f?.type!=="Feature"||!ALLOWED_IDS.includes(f.properties?.id)||seen.has(f.properties.id))fail("invalid or duplicate region");
  seen.add(f.properties.id);
  if(f.geometry?.type!=="Polygon"||!Array.isArray(f.geometry.coordinates)||f.geometry.coordinates.length!==1)fail("unsupported geometry");
  const ring=f.geometry.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4||ring.length>10000||!ring.every(point)||JSON.stringify(ring[0])!==JSON.stringify(ring[ring.length-1]))fail("invalid polygon ring");
 }
 return collection;
}
export function projectPoint([longitude,latitude],width=800,height=440){
 if(!point([longitude,latitude])||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)fail("invalid projection input");
 return [((longitude+180)/360)*width,((90-latitude)/180)*height];
}
export function polygonPath(feature,width=800,height=440){
 if(feature?.geometry?.type!=="Polygon")fail("not a polygon");
 return feature.geometry.coordinates.map(ring=>ring.map((p,i)=>{const [x,y]=projectPoint(p,width,height);return (i?"L":"M")+x.toFixed(2)+" "+y.toFixed(2)}).join(" ")+" Z").join(" ");
}
export async function loadDemoGeoJSON(url,fetcher=fetch){
 const response=await fetcher(url,{credentials:"omit",cache:"no-store"});
 if(!response.ok)fail("load failed");
 return validateCollection(await response.json());
}
