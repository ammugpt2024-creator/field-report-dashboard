function StatCard({ title, value, icon, color }) {

  return (

    <div className={`stat-card ${color}`}>

      <div className="stat-icon">
        {icon}
      </div>

      <div>

        <h3 className="stat-title">
          {title}
        </h3>

        <p className="stat-value">
          {value}
        </p>

      </div>

    </div>
  );
}

export default StatCard;