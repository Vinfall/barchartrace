const { createApp, ref, shallowRef, nextTick } = Vue;

// ===========================
// 配置信息
// ===========================
const settings = {
    covid19: {
        duration: 30,
        top_n: 10,
        title: 'Total cases of COVID-19 per country',
        url: 'https://raw.githubusercontent.com/FabDevGit/barchartrace/master/datasets/covid19-data.csv',
    },
    stackoverflow: {
        duration: 30,
        top_n: 10,
        title: 'StackOverflow questions per language',
        url: 'https://raw.githubusercontent.com/FabDevGit/barchartrace/master/datasets/stackoverflow.csv',
    },
    tennis: {
        duration: 150,
        top_n: 10,
        title: 'ATP tennis ranking',
        url: 'https://raw.githubusercontent.com/FabDevGit/barchartrace/master/datasets/tennis.csv',
    },
    co2: {
        duration: 30,
        top_n: 10,
        title: 'CO2 Emissions from Fossil Fuels per capita, between 1950 and 2014 (in metric tons)',
        url: 'https://raw.githubusercontent.com/FabDevGit/barchartrace/master/datasets/co2.csv',
    },
};

// ===========================
// 工具函数
// ===========================
function groupBy(arr, keyFn) {
    return arr.reduce((acc, obj) => {
        const key = keyFn(obj);
        if (!acc[key]) acc[key] = [];
        acc[key].push(obj);
        return acc;
    }, {});
}

function reshapeData(data) {
    const keys = Object.keys(data[0]);
    const dateKey = keys[0];
    const nameKey = keys[1];
    const valueKey = keys[2];

    const grouped = groupBy(data, (row) => row[dateKey]);
    const allNames = [...new Set(data.map((row) => row[nameKey]))];

    return Object.keys(grouped)
        .sort()
        .map((date) => {
            const row = { [dateKey]: date };
            allNames.forEach((name) => (row[name] = 0));
            grouped[date].forEach((item) => {
                row[item[nameKey]] = +item[valueKey] || 0;
            });
            return row;
        });
}

async function parseCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                let data = results.data;
                if (Object.keys(data[0]).length === 3) {
                    data = reshapeData(data);
                }
                const firstKey = Object.keys(data[0])[0];
                data.forEach((row) => {
                    for (const key in row) {
                        if (key !== firstKey) row[key] = +row[key] || 0;
                    }
                });
                resolve(data);
            },
            error: reject,
        });
    });
}

// ===========================
// 核心动画引擎（修复：容器元素作为参数传入）
// ===========================
function createBarChartRace(container, data, top_n, tickDuration) {
    // 使用传入的容器元素
    const chartDiv = container;
    chartDiv.innerHTML = '';
    const width = chartDiv.clientWidth;
    const height = chartDiv.clientHeight - 50;

    const svg = d3.select(chartDiv).append('svg').attr('width', width).attr('height', height);
    const timeline_svg = d3.select(chartDiv).append('svg').attr('width', width).attr('height', 50);

    const margin = { top: 20, right: 80, bottom: 0, left: 0 };
    const marginTimeAxis = 30;
    const barPadding = (height - (margin.bottom + margin.top)) / (top_n * 5);

    const dateKey = Object.keys(data[0])[0];
    const column_names = Object.keys(data[0]).slice(1);

    const colors = {};
    const colorScale = d3.scaleOrdinal(d3.schemeSet3);
    column_names.forEach((name, i) => {
        colors[name] = colorScale(i);
    });

    const parseTime = d3.timeParse('%Y-%m-%d');
    data.forEach((d) => {
        d[dateKey] = parseTime(d[dateKey]);
        column_names.forEach((k) => (d[k] = Number(d[k])));
    });

    function getRowData(rowIndex) {
        const row = data[rowIndex];
        let items = column_names.map((name) => ({
            name,
            value: row[name],
            lastValue: rowIndex > 0 ? data[rowIndex - 1][name] : row[name],
        }));
        items.sort((a, b) => b.value - a.value);
        items = items.slice(0, top_n);
        items.forEach((d, i) => (d.rank = i));
        return [row[dateKey], items];
    }

    let [currentTime, row_data] = getRowData(0);
    const startDate = d3.min(data, (d) => d[dateKey]);
    const endDate = d3.max(data, (d) => d[dateKey]);

    const t = d3
        .scaleTime()
        .domain([startDate, endDate])
        .range([margin.left + marginTimeAxis, width - margin.right]);

    const timeAxis = d3.axisBottom().ticks(5).scale(t);

    const x = d3
        .scaleLinear()
        .domain([0, d3.max(row_data, (d) => d.value)])
        .range([margin.left, width - margin.right]);

    const y = d3
        .scaleLinear()
        .domain([top_n, 0])
        .range([height - margin.bottom, margin.top]);

    const xAxis = d3
        .axisTop()
        .scale(x)
        .ticks(5)
        .tickSize(-(height - margin.top - margin.bottom))
        .tickFormat((d) => d3.format(',')(d));

    svg.append('g')
        .attr('class', 'axis xAxis')
        .attr('transform', `translate(0, ${margin.top})`)
        .call(xAxis)
        .selectAll('.tick line')
        .classed('origin', (d) => d === 0);

    svg.selectAll('rect.bar')
        .data(row_data, (d) => d.name)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', x(0) + 1)
        .attr('width', (d) => x(d.value) - x(0))
        .attr('y', (d) => y(d.rank) + barPadding / 2)
        .attr('height', y(1) - y(0) - barPadding)
        .style('fill', (d) => colors[d.name]);

    svg.selectAll('text.label')
        .data(row_data, (d) => d.name)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', (d) => x(d.value) - 8)
        .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1)
        .style('text-anchor', 'end')
        .html((d) => d.name);

    svg.selectAll('text.valueLabel')
        .data(row_data, (d) => d.name)
        .enter()
        .append('text')
        .attr('class', 'valueLabel')
        .attr('x', (d) => x(d.value) + 5)
        .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1)
        .text((d) => d3.format(',.0f')(d.lastValue));

    timeline_svg.append('g').attr('class', 'axis tAxis').attr('transform', 'translate(0, 20)').call(timeAxis);

    timeline_svg
        .append('rect')
        .attr('class', 'progressBar')
        .attr('transform', `translate(${marginTimeAxis}, 20)`)
        .attr('height', 2)
        .attr('width', 0);

    const timeText = svg
        .append('text')
        .attr('class', 'timeText')
        .attr('x', width - margin.right)
        .attr('y', height - margin.bottom - 5)
        .style('text-anchor', 'end')
        .html(d3.timeFormat('%B %d, %Y')(currentTime));

    function drawGraph() {
        x.domain([0, d3.max(row_data, (d) => d.value)]);
        svg.select('.xAxis').transition().duration(tickDuration).ease(d3.easeLinear).call(xAxis);

        const bars = svg.selectAll('.bar').data(row_data, (d) => d.name);
        bars.enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', x(0) + 1)
            .attr('width', (d) => x(d.value) - x(0))
            .attr('y', (d) => y(top_n + 1) + 0)
            .attr('height', y(1) - y(0) - barPadding)
            .style('fill', (d) => colors[d.name])
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('y', (d) => y(d.rank) + barPadding / 2);

        bars.transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('width', (d) => x(d.value) - x(0))
            .attr('y', (d) => y(d.rank) + barPadding / 2);

        bars.exit()
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('width', (d) => x(d.value) - x(0))
            .attr('y', (d) => y(top_n + 1) + barPadding / 2)
            .remove();

        const labels = svg.selectAll('.label').data(row_data, (d) => d.name);
        labels
            .enter()
            .append('text')
            .attr('class', 'label')
            .attr('x', (d) => x(d.value) - 8)
            .attr('y', (d) => y(top_n + 1) + (y(1) - y(0)) / 2)
            .style('text-anchor', 'end')
            .html((d) => d.name)
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1);

        labels
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('x', (d) => x(d.value) - 8)
            .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1);

        labels
            .exit()
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('x', (d) => x(d.value) - 8)
            .attr('y', (d) => y(top_n + 1))
            .remove();

        const valueLabels = svg.selectAll('.valueLabel').data(row_data, (d) => d.name);
        valueLabels
            .enter()
            .append('text')
            .attr('class', 'valueLabel')
            .attr('x', (d) => x(d.value) + 5)
            .attr('y', (d) => y(top_n + 1))
            .text((d) => d3.format(',.0f')(d.lastValue))
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1);

        valueLabels
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('x', (d) => x(d.value) + 5)
            .attr('y', (d) => y(d.rank) + (y(1) - y(0)) / 2 + 1)
            .tween('text', (d) => {
                const i = d3.interpolateNumber(d.lastValue, d.value);
                return function (t) {
                    this.textContent = d3.format(',.0f')(i(t));
                };
            });

        valueLabels
            .exit()
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('x', (d) => x(d.value) + 5)
            .attr('y', (d) => y(top_n + 1))
            .remove();

        d3.select('.progressBar')
            .transition()
            .duration(tickDuration)
            .ease(d3.easeLinear)
            .attr('width', t(currentTime) - marginTimeAxis);

        timeText.html(d3.timeFormat('%B %d, %Y')(currentTime));
    }

    let i = 1;
    const interval = d3.interval(() => {
        if (i >= data.length) {
            interval.stop();
            return;
        }
        [currentTime, row_data] = getRowData(i);
        drawGraph();
        i++;
    }, tickDuration);

    return interval;
}

// ===========================
// Vue 应用
// ===========================
const app = createApp({
    setup() {
        const errors = ref([]);
        const csv_data = ref(null);
        const duration = ref(20);
        const top_n = ref(10);
        const title = ref('My bar chart');
        const fileplaceholder = ref('Choose file');
        const chartDiv = ref(null); // 对应模板中的 ref="chartDiv"
        const chartReady = ref(false);
        const showModal = ref(false);
        let interval = null;

        async function loadExample(name) {
            const cfg = settings[name];
            if (!cfg) return;
            duration.value = cfg.duration;
            top_n.value = cfg.top_n;
            title.value = cfg.title;
            try {
                csv_data.value = await parseCSV(cfg.url);
            } catch (e) {
                console.error('加载示例失败', e);
            }
        }

        function loadFile(e) {
            const file = e.target.files[0];
            if (!file) return;
            fileplaceholder.value = file.name;
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    let data = results.data;
                    if (Object.keys(data[0]).length === 3) {
                        data = reshapeData(data);
                    }
                    const firstKey = Object.keys(data[0])[0];
                    data.forEach((row) => {
                        for (const key in row) {
                            if (key !== firstKey) row[key] = +row[key] || 0;
                        }
                    });
                    csv_data.value = data;
                    top_n.value = Math.min(20, Object.keys(data[0] || {}).length - 1);
                },
            });
        }

        function stopRace() {
            if (interval) {
                interval.stop();
                interval = null;
            }
        }

        function checkForm() {
            errors.value = [];
            if (!csv_data.value) {
                errors.value.push('CSV file is required.');
                return;
            }
            if (!duration.value || duration.value <= 0) {
                errors.value.push('Animation duration must be positive.');
                return;
            }
            if (!top_n.value || top_n.value <= 0) {
                errors.value.push('Number of bars must be positive.');
                return;
            }

            if (interval) interval.stop();

            const tickDuration = (duration.value / csv_data.value.length) * 1000;
            const dataCopy = JSON.parse(JSON.stringify(csv_data.value));

            // 关键修改：传入 chartDiv.value (真实的DOM节点)
            interval = createBarChartRace(chartDiv.value, dataCopy, top_n.value, tickDuration);
            chartReady.value = true;

            nextTick(() => {
                const chartCard = document.getElementById('chart-card');
                if (chartCard) {
                    window.scrollTo({
                        top: chartCard.getBoundingClientRect().top + window.scrollY - 10,
                        behavior: 'smooth',
                    });
                }
            });
        }

        return {
            errors,
            csv_data,
            duration,
            top_n,
            title,
            fileplaceholder,
            chartDiv,
            chartReady,
            showModal,
            loadExample,
            loadFile,
            stopRace,
            checkForm,
        };
    },
});

app.mount('#app');
