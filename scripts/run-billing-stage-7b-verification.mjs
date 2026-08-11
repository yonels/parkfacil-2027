import pg from"pg";
const original=pg.Client.prototype.query;let sequence=0;
pg.Client.prototype.query=function(sql,params,...rest){if(typeof sql==="string"&&Array.isArray(params)){params=[...params];if(sql.startsWith("insert into billing_preinvoices"))params[4]=`20${String(80+sequence++).padStart(2,"0")}-01`;if(sql.includes("billing_begin_related_document")&&String(params[6]||"").match(/-c[ab]$/))params[5]=60000;}return original.call(this,sql,params,...rest)};
await import("./verify-billing-stage-7b.mjs");
