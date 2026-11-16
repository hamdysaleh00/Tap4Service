export function sqliteD1(db){
 return {
  prepare(sql){return {sql,params:[],bind(...params){return {...this,params};},async first(){return db.prepare(sql).get(...this.params)??null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){const r=db.prepare(sql).run(...this.params);return {results:[],meta:{changes:r.changes}};}};},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const p=db.prepare(s.sql);if(p.columns().length)return {results:p.all(...s.params)};const result=p.run(...s.params);return {results:[],meta:{changes:result.changes}};});db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}},
 };
}
