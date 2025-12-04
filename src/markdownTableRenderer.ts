export function renderMessageContentWithTables(container: HTMLElement, raw: string): void {
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const stripInlineMarkdown = (s: string): string => {
    return s
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  };

  const splitMarkdownRow = (line: string): string[] => {
    let work = line.trim();
    if (work.startsWith("|")) work = work.slice(1);
    if (work.endsWith("|")) work = work.slice(0, -1);
    return work.split("|").map((cell) => stripInlineMarkdown(cell.trim()));
  };

  const isTableSeparatorLine = (line: string): boolean => {
    const t = line.trim();
    if (!t.startsWith("|")) return false;
    const stripped = t.replace(/[|\s:\-]/g, "");
    return stripped.length === 0 && t.includes("-");
  };

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const table = document.createElement("table");
      table.className = "markdown-table";

      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");

      const headerRow = document.createElement("tr");
      const headerCells = splitMarkdownRow(line);
      headerCells.forEach((cell) => {
        const th = document.createElement("th");
        th.textContent = cell;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      i += 2;

      while (i < lines.length) {
        const rowLine = lines[i];
        const trimmed = rowLine.trim();
        if (!trimmed.startsWith("|") || isTableSeparatorLine(rowLine) || trimmed === "") {
          break;
        }
        const tr = document.createElement("tr");
        const cells = splitMarkdownRow(rowLine);
        cells.forEach((cell) => {
          const td = document.createElement("td");
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
        i++;
      }

      table.appendChild(thead);
      table.appendChild(tbody);

      const wrapper = document.createElement("div");
      wrapper.className = "markdown-table-wrapper";
      wrapper.appendChild(table);

      fragment.appendChild(wrapper);
      continue;
    }

    const normalLines: string[] = [];
    while (
      i < lines.length &&
      !(
        lines[i].trim().startsWith("|") &&
        i + 1 < lines.length &&
        isTableSeparatorLine(lines[i + 1])
      )
    ) {
      if (lines[i].trim() === "" && normalLines.length > 0) {
        break;
      }
      normalLines.push(lines[i]);
      i++;
    }

    if (normalLines.length > 0) {
      const p = document.createElement("p");
      p.textContent = stripInlineMarkdown(normalLines.join("\n"));
      fragment.appendChild(p);
    }

    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }
  }

  container.appendChild(fragment);
}
