import moment from 'moment';
const dir = "./data"

function removeComments(lines) {
    return lines.filter((value) => {
        if(value[0] !== '%') return value
    })
}

function unquoteRelation(relation) {
    if(relation[0] === "'" || relation[0] === '"') {
        relation = relation.slice(1, relation.length - 1)
    }

    return relation;
}

function unquoteString(string, quoteChar) {
    let start = 0, end, cont = true;

    while(cont) {
        cont = false

        end = string.indexOf(quoteChar, start + 1);
        if(end === -1) throw(new Error("Badly quoted string: " + string));

        if(string[end - 1] === '\\') {
            cont = true;
            start = end
        }
    }

    return [string.slice(1, end), string.slice(end + 1)]
}

function unskewer(str) {
    return str.replace(/-/g, '_')
}
 
function skipUnwanted(string, toSkip) {
    let start = 0;
    for(;start < string.length && toSkip.includes(string[start]);start++);

    return string.slice(start)
}

function parseRelation(lines) {
    for(let index = 0; index < lines.length; index++) {
        let [declaration, ...rest] = lines[index].split(" ");
        
        if(declaration.toUpperCase() === "@RELATION") {
            let relation = unskewer(unquoteRelation(rest.join(' ')))
            return [index + 1, relation]
        }
    }
    
    throw(new Error("Relation name not found"))
}

const PARSERS = {
    NUMERIC: {
        parse(value) {
            return +value
        }
    },
    ENUM: {
        parse(value, values) {
            if(!values.includes(value)) {
                throw(new Error(`${value} not in [${values}]`))
            }
            return value
        }
    },
    STRING: {
        parse(value) {
            return value
        }
    },
    DATE: {
        parse(value, extra) {
            return moment(value, extra).toDate()
        }
    }
}

function parseAttribute(attribute) {
    let attributeName, type, extra, rest, sql

    if(['"', "'"].includes(attribute[0])) {
        [attributeName, rest] = unquoteString(attribute, attribute[0])
    } else {
        [attributeName, ...rest] = attribute.split(/[\s]/);
        rest = rest.join(" ")
    }
    attributeName = unskewer(attributeName)
    
    rest = rest.trim()
    let percentIndex = rest.indexOf('%');
    if(percentIndex !== -1) {
        rest = rest.slice(0, percentIndex).trim()
    }

    if(rest[0] === '{') {
        if(rest[rest.length - 1])
        rest = rest.slice(1, rest.length - 1);

        type = "ENUM"
        extra = rest.split(',').map(value => {
            value = skipUnwanted(value, [' ', ','])
            if(['"', "'"].includes(value[0])) return unquoteString(value, value[0])[0].trim()
            return value.trim()
        });
        sql = {
            type: "VARCHAR",
            values: extra
        }
    } else {
        [type, ...rest] = rest.split(" ");
        rest = rest.join(' ')

        type = type.toUpperCase()
        sql = {type}
        switch(type) {
            case "REAL":
            case "INTEGER":
                sql.type = "NUMERIC"
                type = "NUMERIC"
                break;
            case "DATE":
                sql.format = extra = rest
                break;
            case "STRING":
                sql.type = "TEXT"
            case "NUMERIC":
                break;
            case "RELATIONAL":
                throw(new Error("RELATIONAL attributes are not supported"))
            default:
                throw(new Error(`Bad type: |${type}|${rest}| (${attribute})`))
        }
    }

    return {
        name: attributeName,
        type,
        extra,
        sql
    }
}

function parseAttributes(lines, start) {
    let attributes = []
    for(let index = start; index < lines.length; index++) {
        let [declaration, ...rest] = lines[index].split(" ")

        switch(declaration.toUpperCase()) {
            case "@ATTRIBUTE":
                attributes.push(parseAttribute(rest.join(' ')));
                break;
            case "@DATA":
                if(attributes === []) throw(new Error("Attributes not found"));
                return [index + 1, attributes]
        }
    }

    throw(new Error("Data tag not found"));
}

function getNextValue(string) {                     //getNextString
    string = skipUnwanted(string, [' ', ','])
    if(['"', "'"].includes(string[0])) {
        return unquoteString(string, string[0])
    } else {
        let [nextString, ...rest] = string.split(",")
        return [nextString.trim(), rest.join(',')]
    }
}

// function getNextNumber(string) {
//     string = skipUnwanted(string, [' ', ','])

//     let [nextNumber, ...rest] = string.split(",")
//     return [nextNumber.trim(), rest.join(',')]
// }

function parseDataLine(line, attributes) {
    let dataArray = [];

    let remainingLine = line
    let value
    for(let attribute of attributes) {
        let parser = PARSERS[attribute.type]
        switch(attribute.type) {
            case "STRING":
            case "ENUM":
            case "DATE":
            case "NUMERIC":
                [value, remainingLine] = getNextValue(remainingLine)
                break;
            // case "NUMERIC":
            //     [value, remainingLine] = getNextNumber(remainingLine)
            //     break;
            default:
                throw(new Error(`[*] Attribute type "${attribute.type}" unknown`))
        }

        dataArray.push(value === '?' ? null : parser.parse(value, attribute.extra))
    }

    return dataArray
}

function parseData(lines, attributes, start) {
    let parsed = []
    for(let index = start; index < lines.length; index++) {
        
        let dataArray = parseDataLine(lines[index], attributes);

        if(dataArray === []) continue;
        parsed.push(dataArray)
    }

    return parsed
}

export function parse(file) {
    let lines = file.split('\n');
    lines = removeComments(lines);

    let index, relation, attributes, data;
    
    [index, relation] = parseRelation(lines);
    [index, attributes] = parseAttributes(lines, index);
    data = parseData(lines, attributes, index);

    return [relation, attributes, data]
}