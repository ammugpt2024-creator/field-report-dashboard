import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const data = [
  {
    name: "Mon",
    reports: 12
  },
  {
    name: "Tue",
    reports: 18
  },
  {
    name: "Wed",
    reports: 9
  },
  {
    name: "Thu",
    reports: 15
  },
  {
    name: "Fri",
    reports: 22
  }
];

function ActivityChart() {

  return (

    <div className="chart-card">

      <h3>
        Weekly Activity
      </h3>

      <ResponsiveContainer
        width="100%"
        height={300}
      >

        <BarChart data={data}>

          <XAxis dataKey="name" />

          <YAxis />

          <Tooltip />

          <Bar
            dataKey="reports"
            fill="#2563eb"
            radius={[8, 8, 0, 0]}
          />

        </BarChart>

      </ResponsiveContainer>

    </div>
  );
}

export default ActivityChart;