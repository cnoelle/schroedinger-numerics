export class ColorRgba {

    readonly rgba: Readonly<[number, number, number, number]>;

    constructor(rgba: Readonly<[number, number, number, number]>|string) {
        if (typeof rgba === "string")
            rgba = ColorRgba._parseRgbaString(rgba);
        for (let idx=0; idx<3; idx++) {
            const v = rgba[idx];
            if (!Number.isFinite(v) || v < 0 || v > 255 || !Number.isInteger(v))
                throw new Error("Invalid rgb value at position " + idx + " in rgba" + rgba);
        }
        const v = rgba[3];
        if (!Number.isFinite(v) || v < 0 || v > 1)
            throw new Error("Invalid alpha value at position rgba: " + rgba);
        this.rgba = rgba;
    }

    toString(): string {
        return "rgba(" + this.rgba.join(",") + ")";
    }

    private static _parseRgbaString(rgba: string): [number, number, number, number] {
        const rgba0 = rgba;
        rgba = rgba.trim().toLowerCase();
        if (!rgba.startsWith("rgba(") || !rgba.endsWith(")"))
            throw new Error("Invalid rgba color " + rgba);
        rgba = rgba.substring("rgba(".length, rgba.length-1);
        const values = rgba.split(",").map(v => Number.parseFloat(v));
        if (values.length !== 4)
            throw new Error("Invalid rgba string " + rgba0);
        return values as any;
    }

}

