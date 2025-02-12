import React from "react";
import { FaHome, FaEdit, FaQuestionCircle, FaGithub, FaEllipsisV, FaBars } from "react-icons/fa";
import { Link } from "react-router-dom";

const NavBar = ({ isGenomeFormFolded, setIsGenomeFormFolded }) => {
  return (
    <div className="w-full border-b border-gray-300 bg-white mt-2 pb-2 overflow-x-hidden">
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 gap-1">
        {/* Left Buttons - 3 visible on mobile */}
        <div className="flex space-x-0 flex-shrink-0">
          <button
            className="flex items-center space-x-2 border rounded-md border-gray-300 text-gray-700 hover:text-blue-900 focus:outline-none focus:ring focus:ring-blue-300 px-2"
            onClick={() => setIsGenomeFormFolded(!isGenomeFormFolded)}
          >
            <FaBars className="text-md" />
          </button>
          <LinkButton icon={FaHome} label="Home" to="/" />
          <LinkButton icon={FaEdit} label="Edit" to="/edit" />
          {/* Help button will move to right on mobile */}
          <LinkButton 
            icon={FaQuestionCircle} 
            label="Help" 
            to="/help" 
            className="hidden sm:flex" // hidden hides it for bigger screens, shows up only on small
          />
        </div>

        {/* Title - Allows wrapping and takes minimal space */}
        <h1 className="text-xs sm:text-xl font-bold text-gray-900 mx-1 sm:mx-2 whitespace-normal text-center flex-shrink min-w-0 leading-tight">
          Sequence Browser
        </h1>

        {/* Right Buttons - Now 3 on mobile */}
        <div className="flex space-x-0 flex-shrink-0">
          {/* Mobile-only Help button */}
          <LinkButton 
            icon={FaQuestionCircle} 
            label="Help" 
            to="/help" 
            className="sm:hidden" // sm:hidden makes it hidden on small, only shows up on big screens
          />
          <LinkButton 
            icon={FaEllipsisV} 
            label="More" 
            to="https://zhoulab.io/software" 
            isEternal={true} 
          />
          <LinkButton 
            icon={FaGithub} 
            label="GitHub" 
            to="https://github.com" 
            isEternal={true} 
          />
        </div>
      </div>
    </div>
  );
};

// Updated LinkButton component
const LinkButton = ({ icon: Icon, label, to, isEternal, className }) => {
  const baseStyles = "flex items-center space-x-2 rounded-md border border-gray-300 px-1 sm:px-2 py-2 text-gray-700 shadow-sm hover:border-blue-400 hover:text-blue-500 focus:outline-none focus:ring focus:ring-blue-300";

  return isEternal ? (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseStyles} ${className}`}
    >
      {Icon && <Icon className="text-sm sm:text-md" />}
      <span className="hidden sm:inline">{label}</span>
    </a>
  ) : (
    <Link
      to={to}
      className={`${baseStyles} ${className}`}
    >
      {Icon && <Icon className="text-sm sm:text-md" />}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
};

export default NavBar;