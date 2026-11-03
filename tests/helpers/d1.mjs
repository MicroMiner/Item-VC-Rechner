import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../../worker/migrations/0001_news.sql',import.meta.url),'utf8');
export class TestD1 {
 constructor(file=':memory:'){this.db=new DatabaseSync(file);this.db.exec(schema);}
 prepare(sql){const db=this.db;return {bind(...args){return {first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),_sql:sql,_args:args};},first:async()=>db.prepare(sql).get()||null,all:async()=>({results:db.prepare(sql).all()})};}
 async batch(statements){this.db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push({meta:{changes:Number(this.db.prepare(s._sql).run(...s._args).changes)}});this.db.exec('COMMIT');return rows;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
