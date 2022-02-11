import pg from "pg";
import format from "pg-format";
import { parse } from "./parser.js";
import { readdirSync, readFileSync } from 'fs'

import 'dotenv/config'

const dir = "./data"

const client = new pg.Client()
await client.connect()

function drop(table) {
    return client.query(format("DROP TABLE IF EXISTS %I;", table))
}

function create(table, cols) {
    cols = cols.map(col => {
        let constraints = col.sql.values ? format(" CHECK(%I IN (%L))", col.name, col.sql.values) : ""
        return format("%I %s %s", col.name, col.sql.type, constraints)
    })
    return client.query(format("CREATE TABLE %I (%s)", table, cols))
}

function insert(table, rows) {
    return client.query(format("INSERT INTO %I VALUES %L", table, rows))
}

try {
    let files = readdirSync(dir, 'utf-8');

    for(let filename of files) {
        let file = readFileSync(`${dir}/${filename}`, 'utf-8');
        
        let [table, cols, rows] = parse(file)

        await 
            drop(table)
        .then(() => 
            create(table, cols)
        ).then(() => 
            insert(table, rows)
        ).then(res => {
            console.log(`Inserted ${res.rowCount} to ${table.slice(0, 20)}`)
        })
    }

    await client.end()
} catch (error) {
    console.error(error)
    process.exit()
}