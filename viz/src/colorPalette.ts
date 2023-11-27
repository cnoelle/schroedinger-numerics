export class ColorPalette {



    private static readonly COLORS: Array<[string, string, string]> = [
        ["#DA1E37", "#BB3E03", "#EE9B00"], // red, brownish
        ["#1E88E5", "#003459", "#007EA7"],  // blueish
        ["#FF9E00", "#FF7700", "#FF5500"]  // orange
        
    ];
    private static readonly NUM_COLORS: number = ColorPalette.COLORS.length;

    public static getColor(primaryIndex: number, secondaryIndex?: number): string {
        if (secondaryIndex === undefined)
            secondaryIndex = 0;
        primaryIndex = primaryIndex % ColorPalette.NUM_COLORS;
        secondaryIndex = secondaryIndex % 3;
        return ColorPalette.COLORS[primaryIndex][secondaryIndex];
    }

}