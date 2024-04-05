export class JsUtils {

    private constructor() {}

    public static createElement<T extends keyof HTMLElementTagNameMap>(tag: T, options?: {
        parent?: HTMLElement|DocumentFragment;
        classes?: Array<string>;
        id?: string;
        title?: string;
        text?: string;
        html?: string;
        dataset?: Map<string, string>;
        attributes?: Map<string, string>;
    }): HTMLElementTagNameMap[T] {
        const el: HTMLElementTagNameMap[T] = document.createElement(tag);
        if (options?.classes?.length > 0)
            options.classes.forEach(c => el.classList.add(c));
        if (options?.id)
            el.id = options.id;
        if (options?.title)
            el.title = options.title;
        if (options?.attributes)
            options.attributes.forEach((value, key) => el.setAttribute(key, value));
        if (options?.text) {
            if (tag === "input")
                (el as HTMLInputElement).value = options.text;
            else
                el.innerText = options.text;
        }
        else if (options?.html)
            el.innerHTML = options.html;
        if (options?.dataset)
            options.dataset.forEach((val, key) => el.dataset[key] = val);
        if (options?.parent)
            options.parent.appendChild(el);
        return el;
    }

    /**
     * Merge arrays into one, removing duplicates. Assume equal spacing
     * @param arrays 
     * @returns [merged values, are all arrays equal?]
     */
     public static mergeArrays(arrays: Array<Array<number>|undefined>): [Array<number>, boolean] {
        arrays = arrays.filter(arr => arr);
        if (JsUtils.arraysEqual(arrays))
            return [arrays.length > 0 ? arrays[0] : [], true];
        const result: Array<number> = [];
        const iterators: Array<IterableIterator<number>> = arrays.map(arr => arr[Symbol.iterator]())
        const next: Array<IteratorResult<number>> = iterators.map(it => it.next());
        while (next.findIndex(result => !result.done) >= 0) {
            const nextValue: number|undefined = next
                .filter(r => !r.done)
                .map(r => r.value)
                .reduce((min, current) => min === undefined || current < min ? current : min, undefined);
            if (nextValue === undefined) // TODO or throw error? 
                break;
            const indicesToAdvance: Array<number> = next
                .map((val, idx) => [val, idx] as [IteratorResult<number>, number])
                .filter(arr => !arr[0].done && arr[0].value === nextValue)
                .map(arr => arr[1]);
            indicesToAdvance.forEach(idx => next[idx] = iterators[idx].next());
            result.push(nextValue);
        }
        return [result, false];
    }

    private static arraysEqual(xs: Array<Array<number>>): boolean {
        const l: number = xs.length;
        if (l <= 1)
            return true;
        const l0: number = xs[0].length;
        const x0: number = xs[0][0];
        const xn: number = xs[0][l0-1];
        for (let idx=1; idx<l; idx++) {
            const li: number = xs[idx].length;
            if (li !== l0)
                return false;
            if (xs[idx][0] !== x0 || xs[idx][li-1] !== xn)
                return false;
            // else assume they are all equal
        }
        return true;
    }

    public static formatNumber(n: number, numDigits: number = 3) {
        const abs: number = Math.abs(n);
        if (abs >= Math.exp(Math.log(10) * numDigits) || (abs < 0.01 && abs !== 0))
            return n.toExponential(numDigits-1);
        return Intl.NumberFormat("en-US", { maximumSignificantDigits: numDigits }).format(n)
    }

    public static createMathElement<K extends keyof MathMLElementTagNameMap>(tag: K, options?: {
        parent?: HTMLElement|MathMLElement|DocumentFragment;
        text?: string;
    }): MathMLElementTagNameMap[K]{
        const element: MathMLElementTagNameMap[K] = document.createElementNS("http://www.w3.org/1998/Math/MathML", tag);
        if (options.text)
            element.textContent = options.text;
        if (options?.parent)
            options.parent.appendChild(element);
        return element;
    }

    public static loadCss(path: string, options?: { parent?: Element, skipExistingCheck?: boolean }): Promise<HTMLLinkElement> {
        const parent = options?.parent || document.head;
        if (!options?.skipExistingCheck) {
            const existing: Element|undefined = Array.from(parent.children)
                .find(child => child.tagName === "link" && (child as HTMLLinkElement).href === path);
            if (existing !== undefined)
                return Promise.resolve(existing as HTMLLinkElement);
        }
        return new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel="stylesheet";
            link.href = path;
            link.onload = evt => resolve(evt.target as HTMLLinkElement);
            link.onerror = reject; 
            parent.appendChild(link);       
        });
    }

}