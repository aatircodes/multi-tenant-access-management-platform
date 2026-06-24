package saas_access_platform.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import java.util.List;

@Data
public class AssignPermissionsRequest {

    @NotEmpty(message = "At least one permission ID is required")
    private List<Long> permissionIds;
}