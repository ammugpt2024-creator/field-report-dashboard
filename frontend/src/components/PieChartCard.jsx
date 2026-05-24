import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const data = [
  { name: "Field Operations", value: 56 },
  { name: "Concrete Quality Reports", value: 34 },
  { name: "Issues", value: 7 }
];

const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#ea580c"
];

function PieChartCard() {

  return (

    <div className="chart-card">

      <h3>
        Operations Reports Overview
      </h3>

      <ResponsiveContainer
        width="100%"
        height={300}
      >

        <PieChart>

          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
          >

            {data.map((entry, index) => (

              <Cell
                key={index}
                fill={COLORS[index]}
              />

            ))}

          </Pie>

          <Tooltip />

        </PieChart>

      </ResponsiveContainer>

    </div>
  );
}

export default PieChartCard;
