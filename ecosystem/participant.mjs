import {encodeDocument,decodeDocument} from './document-exchange.mjs';
export const REPOSITORY = "Maurits-pixe/PALACO-Citadel";
export async function exportDocument(document, reference) {
  if (reference?.repository !== REPOSITORY) throw new Error('SOURCE_REPOSITORY_MISMATCH');
  return encodeDocument(reference, document);
}
export const readDocument = decodeDocument;

import {createDocument,createQuote} from '../rio/vendor/local-qa.mjs';
export async function readForQa(input) {
  const packet=await readDocument(input), d=packet.document;
  const document=createDocument({documentId:d.documentId,title:d.title,content:d.content,origin:packet.origin,status:d.status});
  if(document.content!==d.content || document.title!==d.title || document.source.verified!==false || document.source.statusProvidedBy!=='USER') throw new Error('QA_METADATA_MISMATCH');
  Object.freeze(document.source);return Object.freeze(document);
}
export async function quoteDocument(input,quote) {
  const document=await readForQa(input);
  if(typeof quote!=='string'||!quote.trim()||!document.content.includes(quote.trim())) throw new Error('QUOTE_NOT_IN_DOCUMENT');
  const result=createQuote(document,quote);Object.freeze(result.source);return Object.freeze(result);
}
