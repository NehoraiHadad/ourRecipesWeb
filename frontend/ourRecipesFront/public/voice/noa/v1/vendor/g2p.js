/**
 * Hebrew grapheme to phoneme, ported from `renikud-onnx`.
 *
 * The adapter reads stressed IPA, not Hebrew spelling, so text has to go
 * through this first. The model predicts a consonant, a vowel and a stress
 * position per character; the vocabularies it needs travel in its own ONNX
 * metadata.
 */
const executionProviders = ["wasm"];
import * as ort from "./ort.wasm.min.mjs";
import { readOnnxMetadata } from "./onnxMeta.js";
const ALEF = "א".codePointAt(0);
const TAV = "ת".codePointAt(0);
const STRESS = "ˈ";
const ORTHOGRAPHIC = new Set(["'", '"']);
const NONE = "∅";
function isHebrew(char) {
    const code = char.codePointAt(0);
    return code >= ALEF && code <= TAV;
}
function argmax(values, offset, count) {
    let best = 0;
    for (let i = 1; i < count; i++)
        if (values[offset + i] > values[offset + best])
            best = i;
    return best;
}
export class HebrewG2P {
    session;
    vocab;
    consonants;
    vowels;
    clsId;
    sepId;
    constraints;
    geresh;
    constructor(session, vocab, consonants, vowels, clsId, sepId, constraints, geresh) {
        this.session = session;
        this.vocab = vocab;
        this.consonants = consonants;
        this.vowels = vowels;
        this.clsId = clsId;
        this.sepId = sepId;
        this.constraints = constraints;
        this.geresh = geresh;
    }
    static async create(model) {
        const metadata = readOnnxMetadata(model);
        const session = await ort.InferenceSession.create(model, {
            executionProviders: [...executionProviders],
            graphOptimizationLevel: "all",
        });
        const numeric = (raw) => Object.fromEntries(Object.entries(JSON.parse(raw)).map(([k, v]) => [Number(k), v]));
        return new HebrewG2P(session, JSON.parse(metadata.vocab), numeric(metadata.consonant_vocab), numeric(metadata.vowel_vocab), Number(metadata.cls_token_id), Number(metadata.sep_token_id), JSON.parse(metadata.letter_consonant_constraints), JSON.parse(metadata.geresh_map ?? "{}"));
    }
    async phonemize(input) {
        const text = input.replace(/[׳'`´]/g, "'").replace(/[״”“]/g, '"');
        const normalized = text.normalize("NFD");
        const characters = [...normalized];
        const unk = this.vocab["[UNK]"] ?? 0;
        const ids = [BigInt(this.clsId)];
        for (const char of characters)
            ids.push(BigInt(this.vocab[char] ?? unk));
        ids.push(BigInt(this.sepId));
        const length = ids.length;
        const outputs = await this.session.run({
            input_ids: new ort.Tensor("int64", BigInt64Array.from(ids), [1, length]),
            attention_mask: new ort.Tensor("int64", new BigInt64Array(length).fill(1n), [1, length]),
        });
        const consonantLogits = outputs.consonant_logits.data;
        const vowelLogits = outputs.vowel_logits.data;
        const stressLogits = outputs.stress_logits.data;
        const consonantClasses = consonantLogits.length / length;
        const vowelClasses = vowelLogits.length / length;
        const stressClasses = stressLogits.length / length;
        // One stressed character per word: the one the model likes most.
        const stressed = new Set();
        let token = 1;
        for (let index = 0; index < characters.length;) {
            if (/\s/.test(characters[index])) {
                index++;
                token++;
                continue;
            }
            let best = token;
            while (index < characters.length && !/\s/.test(characters[index])) {
                if (stressLogits[token * stressClasses + 1] > stressLogits[best * stressClasses + 1]) {
                    best = token;
                }
                index++;
                token++;
            }
            stressed.add(best);
        }
        const out = [];
        characters.forEach((char, index) => {
            const tokenIndex = index + 1;
            if (!isHebrew(char)) {
                if (!ORTHOGRAPHIC.has(char))
                    out.push(char);
                return;
            }
            let consonantId = argmax(consonantLogits, tokenIndex * consonantClasses, consonantClasses);
            const allowed = this.constraints[char];
            if (allowed && !allowed.includes(consonantId)) {
                consonantId = allowed.reduce((best, candidate) => consonantLogits[tokenIndex * consonantClasses + candidate] >
                    consonantLogits[tokenIndex * consonantClasses + best]
                    ? candidate
                    : best);
            }
            let consonant = this.consonants[consonantId] ?? NONE;
            const next = characters[index + 1];
            if (this.geresh[char] && next === "'")
                consonant = this.geresh[char];
            const vowel = this.vowels[argmax(vowelLogits, tokenIndex * vowelClasses, vowelClasses)] ?? NONE;
            const isStressed = stressed.has(tokenIndex);
            const wordFinal = next === undefined || !/\p{L}/u.test(next);
            // Word-final ח with an a vowel is a furtive patah: the vowel comes first.
            if (char === "ח" && wordFinal && vowel === "a") {
                out.push((isStressed ? STRESS : "") + "aχ");
                return;
            }
            let chunk = consonant === NONE ? "" : consonant;
            if (isStressed)
                chunk += STRESS;
            if (vowel !== NONE)
                chunk += vowel;
            out.push(chunk);
        });
        return out.join("");
    }
}
//# sourceMappingURL=g2p.js.map