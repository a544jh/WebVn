import { stringify } from "yaml"
import * as fs from "fs"

const says: string[] = []

for (let i = 0; i < 10000; i++) {
  says.push(`asd ${i}`)
}

const obj = { story: says }

const yaml = stringify(obj)
fs.writeFileSync("bigstory.yaml", yaml)
