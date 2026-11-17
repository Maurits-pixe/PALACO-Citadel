// PALACO Wereldatlas v0.3 — read-only, fail-closed DRAFT contract.
export const CONTRACT = "palaco.world.atlas.draft.v0.3";
const WORLD_ID = /^W-[0-9]{4}$/;
const REGION_ID = /^REGION-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const text = (value,max=240) => typeof value==="string" && value.length>0 && value.length<=max && value.trim()===value && !/[\u0000-\u001f\u007f]/.test(value);
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const record = x => x!==null && typeof x==="object" && !Array.isArray(x);
const fields = (obj,allowed) => Object.keys(obj).every(k=>allowed.includes(k));
export function validateAtlasDraft(doc){
  const errors=[];
  const fail=reason=>errors.push(reason);
  if(!record(doc)){fail("Document moet een JSON-object zijn.");return {ok:false,errors};}
  if(!fields(doc,["schema","state","verified","worlds"]))fail("Onbekend topniveauveld.");
  if(doc.schema!==CONTRACT)fail("Ongeldig schema.");
  if(doc.state!=="DRAFT" || doc.verified!==false)fail("Alleen niet-geverifieerde DRAFT-invoer is toegestaan.");
  if(!Array.isArray(doc.worlds)||doc.worlds.length<1||doc.worlds.length>100){fail("Werelden: 1 tot 100 toegestaan.");return {ok:false,errors};}
  const seenWorlds=new Set(),seenRegions=new Set();
  doc.worlds.forEach((world,i)=>{
    const p="worlds["+i+"]";
    if(!record(world)){fail(p+" moet een object zijn.");return;}
    if(!fields(world,["id","name","summary","regions"]))fail(p+" heeft onbekende velden.");
    if(!WORLD_ID.test(world.id??""))fail(p+".id is ongeldig.");
    if(seenWorlds.has(world.id))fail(p+".id is dubbel.");seenWorlds.add(world.id);
    if(!text(world.name,80)||!text(world.summary,500))fail(p+" vereist geldige naam en beschrijving.");
    if(!Array.isArray(world.regions)||world.regions.length>50){fail(p+".regions mag maximaal 50 regio's bevatten.");return;}
    world.regions.forEach((region,j)=>{
      const rp=p+".regions["+j+"]";
      if(!record(region)){fail(rp+" moet een object zijn.");return;}
      if(!fields(region,["id","name","summary","source","verified"]))fail(rp+" heeft onbekende velden.");
      if(!REGION_ID.test(region.id??""))fail(rp+".id is ongeldig.");
      if(seenRegions.has(region.id))fail(rp+".id is dubbel.");seenRegions.add(region.id);
      if(!text(region.name,80)||!text(region.summary,500)||!text(region.source,240))fail(rp+" vereist naam, beschrijving en bronlabel.");
      if(region.verified!==false)fail(rp+".verified moet false zijn.");
    });
  });
  return {ok:errors.length===0,errors};
}
