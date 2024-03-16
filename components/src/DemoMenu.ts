export class DemoMenu {

    constructor(
            menu: HTMLElement,
            vizContainer: HTMLElement,
            hideMenu: HTMLElement,
            showMenu: HTMLElement
    ) {
        const hideShowMenu = (show?: boolean) => {
            if (show === undefined)
                show = menu.hidden;
            menu.hidden = !show;
            hideMenu.hidden = !show;
            showMenu.hidden = show;
            const margin: number = show ? 350 : 0;
            //viz.style.marginLeft = margin + "px";
            if (show)
                vizContainer.classList.add("menu-margin");
            else
                vizContainer.classList.remove("menu-margin");
            //this.#plotsController.setMargin(margin);
            /* TODO
                setMargin(margin: number): void {
                const width: number = document.body.clientWidth;
                this.#psiPlot.setWidth(width - margin);
                this.#differencePlot.setWidth(width - margin);
                // TODO this.#observablesPlot
            }
            */
        };
    
    }

}