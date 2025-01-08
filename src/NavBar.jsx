import React from "react";
import { FaHome, FaEdit, FaQuestionCircle, FaGithub, FaEllipsisV, FaBars } from "react-icons/fa";
import { Link } from "react-router-dom";

const LinkButton = ({ icon: Icon, label, to, isEternal }) => {
  // open external links as a separate page
  // internal links redirect to page
  return isEternal ? (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center space-x-2 rounded-md border border-gray-300 px-4 py-2 text-gray-700 shadow-sm hover:border-blue-400 hover:text-blue-500 focus:outline-none focus:ring focus:ring-blue-300"
    >
      {Icon && <Icon className="text-md" />}
      <span>{label}</span>
    </a>
  ) : (
    <Link
      to={to}
      className="flex items-center space-x-2 rounded-md border border-gray-300 px-4 py-2 text-gray-700 shadow-sm hover:border-blue-400 hover:text-blue-500 focus:outline-none focus:ring focus:ring-blue-300"
    >
      {Icon && <Icon className="text-md" />}
      <span>{label}</span>
    </Link>
  )
};

const NavBar = ({ isGenomeFormFolded, setIsGenomeFormFolded }) => {
  return (
    <div className="w-full border-b border-gray-300 bg-white mt-2 pb-2">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left Buttons */}
        <div className="flex space-x-0">
          {/* Hamburger Button */}
          <button
            className="flex items-center space-x-2 border rounded-md border-gray-300 text-gray-700 hover:text-blue-900 focus:outline-none focus:ring focus:ring-blue-300 px-2"
            onClick={() => setIsGenomeFormFolded(!isGenomeFormFolded)}
          >
            <FaBars className="text-md" />  
            {/* <span>{isGenomeFormFolded ? "Show Genome Form" : "Hide Genome Form"}</span> */}
          </button>
          <LinkButton icon={FaHome} label="Home" to="/" />
          <LinkButton icon={FaEdit} label="Edit" to="/edit" />
          <LinkButton icon={FaQuestionCircle} label="Help" to="/help" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-gray-900">Sequence Browser</h1>

        {/* Right Buttons */}
        <div className="flex space-x-0">
          <LinkButton icon={FaEllipsisV} label="More" to="https://zhoulab.io/software" isEternal={true} />
          <LinkButton icon={FaGithub} label="GitHub" to="https://github.com" isEternal={true} />
        </div>
      </div>
    </div>
  );
};

export default NavBar;