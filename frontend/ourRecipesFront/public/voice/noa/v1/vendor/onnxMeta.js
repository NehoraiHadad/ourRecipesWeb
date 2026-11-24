/**
 * The metadata an ONNX file carries, without parsing the graph.
 *
 * onnxruntime-web exposes input and output names but not `metadata_props`, and
 * some models — renikud's Hebrew G2P among them — keep their vocabularies
 * there. Walking the top level of the protobuf costs nothing: every field is
 * length-prefixed, so the multi-megabyte graph is one skip.
 */
const METADATA_PROPS = 14;
class Cursor {
    bytes;
    offset = 0;
    constructor(bytes) {
        this.bytes = bytes;
    }
    get done() {
        return this.offset >= this.bytes.length;
    }
    varint() {
        let value = 0;
        let shift = 0;
        for (;;) {
            const byte = this.bytes[this.offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0)
                return value;
            shift += 7;
        }
    }
    slice() {
        const length = this.varint();
        const out = this.bytes.subarray(this.offset, this.offset + length);
        this.offset += length;
        return out;
    }
    skip(wire) {
        if (wire === 0)
            this.varint();
        else if (wire === 1)
            this.offset += 8;
        else if (wire === 2)
            this.slice();
        else if (wire === 5)
            this.offset += 4;
        else
            throw new Error(`unsupported wire type ${wire}`);
    }
}
export function readOnnxMetadata(model) {
    const cursor = new Cursor(model instanceof Uint8Array ? model : new Uint8Array(model));
    const decoder = new TextDecoder();
    const metadata = {};
    while (!cursor.done) {
        const tag = cursor.varint();
        const field = tag >>> 3;
        const wire = tag & 7;
        if (field !== METADATA_PROPS || wire !== 2) {
            cursor.skip(wire);
            continue;
        }
        const entry = new Cursor(cursor.slice());
        let key = "";
        let value = "";
        while (!entry.done) {
            const entryTag = entry.varint();
            const entryField = entryTag >>> 3;
            const entryWire = entryTag & 7;
            if (entryField === 1 && entryWire === 2)
                key = decoder.decode(entry.slice());
            else if (entryField === 2 && entryWire === 2)
                value = decoder.decode(entry.slice());
            else
                entry.skip(entryWire);
        }
        if (key)
            metadata[key] = value;
    }
    return metadata;
}
//# sourceMappingURL=onnxMeta.js.map