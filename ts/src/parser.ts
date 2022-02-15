import fs from "fs"
import moment from "moment"

type SQLType = "NUMERIC" | "DATE" | "TEXT" | "VARCHAR"
type SQLProperty = {
    type: SQLType,
    values?: string[]
    format?: string
}

type DataType = "NUMERIC" | "DATE" | "STRING" | "ENUM"

export type DataAttribute = {
    name: string
    type: DataType,
    extra?: string | string[],
    sql: SQLProperty
}

export type DataArray = (string | number | Date | null)[][]

function removeComments(lines: string[]): string[] {
    return lines.filter(value => {
        if (value[0] !== '%') return value
    })
}

/** Removes the quotes around a string, returning both the unquoted string and what comes after it */
function unquoteString(string: string, quoteChar: string): [string, string] {
    let start = 0
    let end: number
    let cont: boolean

    do {
        cont = false
        end = string.indexOf(quoteChar, start + 1)
        if (end === -1) throw (new Error(`Badly quoted string: (${string})`))

        if (string[end - 1] === `\\`) {
            cont = true
            start = end
        }
    } while (cont)

    return [
        string.slice(1, end),
        string.slice(end + 1)
    ]
}

/** Searches for the RELATION declaration and returns the string that comes after it on the line, throwing an Error if it can't find it before EOF */
function parseName(lines: string[]): [number, string] {
    for (let index = 0; index < lines.length; index++) {
        const [declaration, ...rest] = lines[index].split(" ");

        if (declaration.toUpperCase() === "@RELATION") {
            let name = rest.join(' ')
            if ([`'`, `"`].includes(name[0])) {
                [name] = unquoteString(name, name[0])
            }

            return [index + 1, name]
        }
    }

    throw (new Error("Relation name was not found"))
}

/** Erases as many characters as possible from the beggining of the string.*/
function skipUnwanted(string: string, toSkip: string[]): string {
    let start = 0;
    for (; start < string.length && toSkip.includes(string[start]); start++);

    return string.slice(start)
}

/** @returns The index of the first percent sign that isn't part of a string, which represents the start of a line comment at the end of an ARFF file line */
function findLineComment(line: string): number {
    let quoteChar: string | undefined = undefined
    let isInsideString = false
    let nextIsUncomment = false

    for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\" && isInsideString && !nextIsUncomment) {
            nextIsUncomment = true
            continue
        }

        if ([`'`, `"`].includes(line[i]) && !isInsideString) {
            isInsideString = true
            quoteChar = line[i]
            continue
        }

        if (isInsideString && line[i] === quoteChar && !nextIsUncomment) {
            isInsideString = false
            quoteChar = undefined
            continue
        }

        if (line[i] === "%" && !isInsideString) {
            return i
        }

        nextIsUncomment = false
    }

    return -1
}

/** 
 * @param line A line from the ARFF file that originally started with the "ATTRIBTE" declaration
*/
function parseAttribute(line: string): DataAttribute {
    let name: string
    let remaining: string | string[]

    if ([`"`, `'`].includes(line[0])) {
        [name, remaining] = unquoteString(line, line[0])
    } else {
        let rest: string[]

        [name, ...rest] = line.split(/[\s]/);
        remaining = rest.join(" ")
    }

    remaining = remaining.trim()
    const percentIndex = findLineComment(remaining);
    if (percentIndex !== -1) {
        remaining = remaining.slice(0, percentIndex).trim()
    }

    //Enumerated data types contain an open brace immediately after the attribute name, in place of the attribute type
    if (remaining[0] === '{') {
        if (remaining[remaining.length - 1])
            remaining = remaining.slice(1, remaining.length - 1);

        const values = remaining.split(',').map(value => {
            value = skipUnwanted(value, [' ', ','])
            if (['"', "'"].includes(value[0])) return unquoteString(value, value[0])[0].trim()
            return value.trim()
        });
        return {
            name,
            type: "ENUM",
            extra: values,
            sql: {
                type: "VARCHAR",
                values
            }
        }
    } else {
        //Non-enumerated data types contain the data type after the attribute namem with the rest of the line 
        // containing extra info for certain data types that need it, such as dates.
        const [first, ...rest] = remaining.split(" ");

        remaining = rest.join(' ')
        switch (first.toUpperCase()) {
            case "REAL":
            case "INTEGER":
            case "NUMERIC":
                return {
                    name,
                    type: "NUMERIC",
                    sql: {
                        type: "NUMERIC"
                    }
                }
            case "DATE":
                return {
                    name,
                    type: "DATE",
                    extra: remaining.trim(),
                    sql: {
                        type: "DATE"
                    }
                }
            case "STRING":
                return {
                    name,
                    type: "STRING",
                    sql: {
                        type: "TEXT"
                    }
                }
            case "RELATIONAL":
                //Relational data types are a proposed addition to the ARFF language. I haven't come across them in the wild, so 
                //  I chose not to implement them, as I feel they would add an extra layer of complexity that (I feel) isn't worth it.
                throw (new Error("RELATIONAL attributes are not supported"))
            default:
                throw (new Error(`Bad type: [${first}|${remaining}] (${line})`))
        }
    }
}

function parseAttributes(lines: string[], start: number): [number, DataAttribute[]] {
    const attributes = []
    for (let index = start; index < lines.length; index++) {
        const [declaration, ...rest] = lines[index].split(" ")

        switch (declaration.toUpperCase()) {
            case "@ATTRIBUTE":
                attributes.push(parseAttribute(rest.join(' ')));
                break;
            case "@DATA":
                if (attributes === []) throw (new Error("Attributes not found"));
                return [index + 1, attributes]
        }
    }

    throw (new Error("Data tag not found"));
}

function getNextValue(string: string): [string, string] {
    string = skipUnwanted(string, [' ', ','])
    if (['"', "'"].includes(string[0])) {
        return unquoteString(string, string[0])
    } else {
        const [nextString, ...rest] = string.split(",")
        return [nextString.trim(), rest.join(',')]
    }
}

function parseDataLine(line: string, attributes: DataAttribute[]) {
    const data = [];

    let remaining = line
    let raw
    for (const attribute of attributes) {
        [raw, remaining] = getNextValue(remaining)

        if (raw === '?') {
            data.push(null)
            continue
        }

        switch (attribute.type) {
            case "STRING":
                data.push(raw)
                break;
            case "ENUM":
                if (!attribute.extra) {
                    throw new Error(`No list of valid values provided`)
                }
                if (!attribute.extra.includes(raw)) {
                    throw new Error(`'${raw}' not in [${attribute.extra}]`)
                }

                data.push(raw)
                break;
            case "DATE":
                data.push(
                    attribute.extra ?
                        moment(raw, attribute.extra).toDate()
                        : new Date(raw)
                )
                break;
            case "NUMERIC":
                data.push(+raw)
                break;
        }
    }

    return data
}

function parseData(lines: string[], attributes: DataAttribute[], start: number) {
    const parsed = []
    for (let index = start; index < lines.length; index++) {

        const dataArray = parseDataLine(lines[index], attributes);

        if (dataArray === []) continue;
        parsed.push(dataArray)
    }

    return parsed
}

export default class Parser {
    name: string
    attributes: DataAttribute[]
    data: DataArray

    constructor(path: string, encoding: BufferEncoding) {
        const file = fs.readFileSync(path, encoding)
        let lines = file.split('\n')

        lines = removeComments(lines)

        let index = -1;
        [index, this.name] = parseName(lines);
        [index, this.attributes] = parseAttributes(lines, index)
        this.data = parseData(lines, this.attributes, index)
    }
}