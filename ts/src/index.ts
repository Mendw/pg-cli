import pg from "pg";
import format from "pg-format";
import Parser, {DataAttribute, DataArray} from "./parser";
import { readdirSync } from 'fs'

import 'dotenv/config'

const dir = "./data"
const client = new pg.Client()

/** Executes a dynamic DROP TABLE query 
 * @returns A promise that resolves into the result of the query
*/
function drop(table: string) {
    return client.query(format("DROP TABLE IF EXISTS %I;", table))
}

/** Executes a dynamic CREATE TABLE query 
 * @returns A promise that resolves into the result of the query
*/
function create(table: string, columns: DataAttribute[]) {
    // For each column, if there is a sql.values array set, this adds a check constraint for the values within it
    //If there isn't, then it just outputs "${column.name} ${column.type}", but sanitized.
    const colStrings = columns.map(column => {
        const constraints = column.sql.values ? format(" CHECK(%I IN (%L))", column.name, column.sql.values) : ""
        return format("%I %s %s", column.name, column.sql.type, constraints)
    })
    return client.query(format("CREATE TABLE %I (%s)", table, colStrings))
}

/** Executes a dynamic INSERT INTO query
 * @returns A promise that resolves into the result of the query
*/
function insert(table: string, rows: DataArray) {
    return client.query(format("INSERT INTO %I VALUES %L", table, rows))
}

(async () => {
    await client.connect()
    try {
        const files = readdirSync(dir, 'utf-8');
    
        for(const filename of files) {        
            const {
                name: table, 
                attributes: columns, 
                data: rows
            } = new Parser(`${dir}/${filename}`, 'utf-8')
    
            await 
                drop(table)
            .then(() => 
                create(table, columns)
            ).then(() => 
                insert(table, rows)
            ).then(res => {
                console.log(`${res.command} ${res.rowCount} rows into ${table.slice(0, 20)}`)
            })
        }
    
        await client.end()
    } catch (error) {
        console.error(error)
        process.exit()
    }
})() //Dirty auto-called function