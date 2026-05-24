import React from 'react';
import ActionButton from './ActionButton';
import { getReportActions, ACTION_IDS } from '../workflow/workflowEngine';

const ReportActions = ({ 
  role, 
  status, 
  onAction, 
  pdfUrl, 
  className = '',
  isMobile = false,
  allowedActions = null
}) => {
  const actions = getReportActions(role, status).filter((action) => {
    if (Array.isArray(allowedActions) && !allowedActions.includes(action.id)) {
      return false;
    }
    if ([ACTION_IDS.PDF_PREVIEW, ACTION_IDS.PDF_SUBMITTED, ACTION_IDS.PDF_APPROVED, ACTION_IDS.DOWNLOAD, ACTION_IDS.DOWNLOAD_FINAL].includes(action.id)) {
      return Boolean(pdfUrl);
    }
    return true;
  });

  if (!actions || actions.length === 0) return null;

  const handleActionClick = (actionId) => {
    if (onAction) {
      onAction(actionId);
    }
  };

  const getActionHref = (actionId) => {
    if ([
      ACTION_IDS.PDF_PREVIEW,
      ACTION_IDS.PDF_SUBMITTED,
      ACTION_IDS.PDF_APPROVED,
      ACTION_IDS.DOWNLOAD,
      ACTION_IDS.DOWNLOAD_FINAL
    ].includes(actionId)) {
      return pdfUrl;
    }
    return null;
  };

  const isDownloadAction = (actionId) => {
    return [ACTION_IDS.DOWNLOAD, ACTION_IDS.DOWNLOAD_FINAL].includes(actionId);
  };

  return (
    <div className={`flex ${isMobile ? 'flex-col' : 'flex-wrap'} gap-2 ${className}`}>
      {actions.map((action) => (
        <ActionButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          intent={action.intent}
          href={getActionHref(action.id)}
          download={isDownloadAction(action.id) ? true : undefined}
          onClick={() => handleActionClick(action.id)}
          className={isMobile ? 'w-full' : ''}
        />
      ))}
    </div>
  );
};

export default ReportActions;
